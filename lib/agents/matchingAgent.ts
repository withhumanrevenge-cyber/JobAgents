import { createServiceClient } from "@/lib/supabase/server"
import { callGroq, parseJsonFromGroq } from "@/lib/groq"
import { Job, Profile, ParsedResume, MatchScoreResult, JobStatus } from "@/types"

export async function scoreJob(
  job: Job,
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
${job.description?.slice(0, 2000) || "No description provided."}

CANDIDATE:
${candidateContext}`

  const response = await callGroq(userPrompt, systemPrompt)

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

export async function matchJobsForUser(userId: string): Promise<{ matched: number; skipped: number }> {
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

  const { data: matchedJobIdsData } = await supabase
    .from("matches")
    .select("job_id")
    .eq("user_id", userId)

  const matchedJobIds = (matchedJobIdsData || []).map((m) => m.job_id)

  let jobsQuery = supabase.from("jobs").select("*").order("posted_date", { ascending: false })
  if (matchedJobIds.length > 0) {
    jobsQuery = jobsQuery.not("id", "in", `(${matchedJobIds.join(",")})`)
  }

  const { data: unmatchedJobsRaw, error: jobsError } = await jobsQuery
  if (jobsError || !unmatchedJobsRaw || unmatchedJobsRaw.length === 0) {
    console.log("No unmatched jobs found.")
    return { matched: 0, skipped: 0 }
  }

  const unmatchedJobs = unmatchedJobsRaw.slice(0, 50)
  console.log(`Scoring ${unmatchedJobs.length} unmatched jobs with Groq...`)

  let matchedCount = 0
  let skippedCount = 0

  for (const job of unmatchedJobs) {
    let matchResult: MatchScoreResult
    let aiSucceeded = true

    try {
      matchResult = await scoreJob(job, profile, parsedResume)
    } catch (err) {
      aiSucceeded = false
      console.warn(`Groq scoring failed for job ${job.id}:`, err instanceof Error ? err.message : err)
      matchResult = {
        score: 50,
        reason: "AI scoring unavailable — review this job manually.",
        matched_skills: [],
        missing_skills: [],
      }
    }

    const passedThreshold = matchResult.score >= profile.match_threshold
    let status: JobStatus = "pending"
    if (aiSucceeded) {
      status = passedThreshold ? "reviewed" : "skipped"
    }

    // The agent NEVER marks something as "applied" — that's strictly a user action via Mark Applied / Smart Apply.
    // High-score jobs land as "reviewed" (displayed as "Matched"); the user decides whether to apply.
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
      if (aiSucceeded && passedThreshold) matchedCount++
      else skippedCount++
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  return { matched: matchedCount, skipped: skippedCount }
}
