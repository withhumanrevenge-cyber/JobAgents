import { createServiceClient } from "@/lib/supabase/server"
import { callGroq, parseJsonFromGroq, FAST_MODEL } from "@/lib/groq"
import { PLAN_CONFIG, effectivePlan } from "@/lib/plans"
import { Job, Profile, ParsedResume, MatchScoreResult, JobStatus } from "@/types"

type ScorableJob = Pick<Job, "id" | "title" | "company" | "location" | "tags" | "description">

export async function scoreJob(
  job: ScorableJob,
  profile: Profile,
  parsedResume: ParsedResume | null
): Promise<MatchScoreResult> {
  const systemPrompt = `You are a precise job-matching assistant. Score how well a candidate's resume matches a job description.
Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence explaining the score>",
  "matched_skills": ["<skill that matches>", ...],
  "missing_skills": ["<skill required but absent>", ...]
}
Scoring guide: 0-49 = poor fit, 50-74 = partial fit, 75-100 = strong fit.
Base the score primarily on skills match, years of experience relevance, and role alignment.`

  const statedTargets: string[] = Array.isArray(profile.target_roles) ? profile.target_roles.filter(Boolean) : []
  const targetLine = statedTargets.length > 0
    ? `Roles the candidate is ACTIVELY searching for (prioritize these): ${statedTargets.join(", ")}`
    : parsedResume ? `Inferred target role from resume: ${parsedResume.target_role}` : ""

  const candidateContext = parsedResume
    ? `${targetLine}
Years of Experience: ${parsedResume.years_experience}
Skills: ${parsedResume.skills.join(", ")}
Summary: ${parsedResume.summary}
Recent Roles: ${parsedResume.experience.slice(0, 2).map((e) => `${e.title} at ${e.company}`).join(" | ")}`
    : `${targetLine}
Name: ${profile.full_name || "Unknown"}
LinkedIn: ${profile.linkedin_url || "Not provided"}
No parsed resume — scoring based on limited profile info.`

  const userPrompt = `JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Remote"}
Required Skills/Tags: ${job.tags.join(", ")}
Description:
${job.description?.slice(0, 900) || "No description provided."}

CANDIDATE:
${candidateContext}`

  // Groq's free tier caps tokens-per-minute aggressively; a 429 is transient
  // and usually clears in <5s. Retry once with a short back-off before giving up.
  let response = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await callGroq(userPrompt, systemPrompt, { model: FAST_MODEL, meterUserId: profile.user_id, maxTokens: 700 })
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === 0 && /rate|429|quota/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }
      throw err
    }
  }

  const parsed = parseJsonFromGroq<MatchScoreResult>(response)
  if (parsed && typeof parsed.score === "number") {
    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score))),
      reason: parsed.reason || "Match score computed.",
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [],
    }
  }

  return {
    score: 50,
    reason: "Could not parse AI response — defaulting to 50.",
    matched_skills: [],
    missing_skills: [],
  }
}

const BATCH_LIMIT = 24
const CONCURRENCY = 4

const COUNTRY_ISO_TO_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", DE: "Germany",
  FR: "France", IN: "India", AU: "Australia", NL: "Netherlands",
  SG: "Singapore", AE: "United Arab Emirates", ZA: "South Africa",
  NZ: "New Zealand", PL: "Poland", IE: "Ireland", ES: "Spain",
  IT: "Italy", MX: "Mexico", BR: "Brazil", CH: "Switzerland",
}

export async function matchJobsForUser(
  userId: string,
  opts?: { limit?: number },
): Promise<{ matched: number; skipped: number; remaining: number }> {
  const supabase = createServiceClient()

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (profileError || !profile) {
    throw new Error(`Profile not found for user: ${userId}`)
  }

  const parsedResume: ParsedResume | null = profile.parsed_resume ?? null
  const targetRoles: string[] = Array.isArray(profile.target_roles) ? profile.target_roles.filter(Boolean) : []
  if (!parsedResume && targetRoles.length === 0) {
    throw new Error("Upload your resume (or set target roles in Settings) so the AI can score jobs against you.")
  }

  const { data: matchedJobIdsData } = await supabase
    .from("matches")
    .select("job_id")
    .eq("user_id", userId)

  const matchedJobIds = new Set((matchedJobIdsData || []).map((m) => m.job_id))

  const plan = effectivePlan(profile)
  const sources = PLAN_CONFIG[plan].allSources
    ? ["adzuna", "greenhouse", "lever", "ashby"] as const
    : ["adzuna"] as const
  const targetCountryName = profile.target_country ? COUNTRY_ISO_TO_NAME[profile.target_country.toUpperCase()] : null

  // Fair-share pool: pull up to PER_SOURCE_POOL rows from EACH enabled source so
  // one high-volume source (Adzuna) can't crowd out the others in the 600-row
  // Supabase cap. Merged pool feeds the unmatched filter + per-run cap below.
  const PER_SOURCE_POOL = 400
  const perSourceResults = await Promise.all(sources.map(async (s) => {
    let q = supabase
      .from("jobs")
      .select("id, title, company, location, tags, description, posted_date, source, country")
      .eq("source", s)
      .order("posted_date", { ascending: false })
      .limit(PER_SOURCE_POOL)
    if (targetCountryName) {
      q = q.in("country", [targetCountryName, "Worldwide"])
    }
    const { data } = await q
    return data ?? []
  }))
  const recentJobs = perSourceResults.flat()
  if (recentJobs.length === 0) {
    return { matched: 0, skipped: 0, remaining: 0 }
  }

  // Interleave sources so the per-run scoring cap spreads across sources instead
  // of exhausting Adzuna first (which would happen with a simple flat/concat).
  const bySrc: Record<string, typeof recentJobs> = {}
  for (const j of recentJobs) (bySrc[j.source] ||= []).push(j)
  const interleaved: typeof recentJobs = []
  const maxLen = Math.max(...Object.values(bySrc).map((a) => a.length))
  for (let i = 0; i < maxLen; i++) {
    for (const s of sources) {
      const row = bySrc[s]?.[i]
      if (row) interleaved.push(row)
    }
  }

  const unmatchedJobsRaw = interleaved.filter((j) => !matchedJobIds.has(j.id))
  if (unmatchedJobsRaw.length === 0) {
    return { matched: 0, skipped: 0, remaining: 0 }
  }

  const perRunCap = PLAN_CONFIG[effectivePlan(profile)].matchPerRun
  const eligible = unmatchedJobsRaw.slice(0, perRunCap)
  const batchSize = Math.min(opts?.limit ?? BATCH_LIMIT, eligible.length)
  const batch = eligible.slice(0, batchSize)
  const remaining = eligible.length - batch.length

  let matchedCount = 0
  let skippedCount = 0

  const scoreOne = async (job: ScorableJob) => {
    let matchResult: MatchScoreResult
    try {
      matchResult = await scoreJob(job, profile, parsedResume)
    } catch (err) {
      console.warn(`Groq scoring failed for job ${job.id}:`, err instanceof Error ? err.message : err)
      return
    }

    const passedThreshold = matchResult.score >= profile.match_threshold
    const status: JobStatus = passedThreshold ? "reviewed" : "skipped"

    const { error: insertError } = await supabase.from("matches").insert({
      user_id: userId,
      job_id: job.id,
      match_score: matchResult.score,
      match_reason: matchResult.reason,
      matched_skills: matchResult.matched_skills,
      missing_skills: matchResult.missing_skills,
      status,
      applied_at: null,
    })

    if (insertError) {
      console.error(`Failed to save match for job ${job.id}:`, insertError.message)
    } else {
      if (passedThreshold) matchedCount++
      else skippedCount++
    }
  }

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(scoreOne))
  }

  return { matched: matchedCount, skipped: skippedCount, remaining }
}
