import { createServiceClient } from "@/lib/supabase/server"
import { callGroq, parseJsonFromGroq, FAST_MODEL } from "@/lib/groq"
import { JobPosting, ParsedResume, MatchScoreResult } from "@/types"

async function scoreCandidate(
  posting: JobPosting,
  candidate: { full_name: string | null; parsed_resume: ParsedResume }
): Promise<MatchScoreResult> {
  const systemPrompt = `You are a precise technical recruiter. Score how well a candidate fits an open role.
Return ONLY valid JSON — no markdown, no text outside the JSON:
{
  "score": <integer 0-100>,
  "reason": "<one clear sentence on the fit, from the recruiter's perspective>",
  "matched_skills": ["<candidate skill the role needs>", ...],
  "missing_skills": ["<role requirement the candidate lacks>", ...]
}
Scoring guide: 0-49 = weak, 50-74 = worth a look, 75-100 = strong fit. Weigh skills overlap, years of experience against the required seniority, and role alignment.`

  const r = candidate.parsed_resume
  const userPrompt = `OPEN ROLE:
Title: ${posting.title}
Seniority: ${posting.experience_level}
Location: ${posting.location || "—"} (${posting.job_type})
Required skills: ${posting.skills.join(", ") || "see description"}
Description:
${posting.description.slice(0, 2000)}

CANDIDATE:
Name: ${candidate.full_name || r.name || "Candidate"}
Target role: ${r.target_role}
Years of experience: ${r.years_experience}
Skills: ${r.skills.join(", ")}
Summary: ${r.summary}
Recent roles: ${r.experience.slice(0, 2).map((e) => `${e.title} at ${e.company}`).join(" | ")}`

  const response = await callGroq(userPrompt, systemPrompt, { model: FAST_MODEL, meterUserId: posting.recruiter_id })
  const parsed = parseJsonFromGroq<MatchScoreResult>(response)
  if (parsed && typeof parsed.score === "number") {
    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score))),
      reason: parsed.reason || "Fit score computed.",
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [],
    }
  }
  return { score: 50, reason: "Could not parse AI response — defaulting to 50.", matched_skills: [], missing_skills: [] }
}

export async function matchCandidatesForPosting(postingId: string): Promise<{ scored: number }> {
  const supabase = createServiceClient()

  const { data: posting, error: pErr } = await supabase.from("job_postings").select("*").eq("id", postingId).single()
  if (pErr || !posting) throw new Error("Posting not found.")

  const { data: candidates } = await supabase
    .from("profiles")
    .select("user_id, full_name, parsed_resume")
    .eq("account_type", "seeker")
    .eq("open_to_work", true)
    .not("parsed_resume", "is", null)
    .limit(50)

  if (!candidates || candidates.length === 0) return { scored: 0 }

  const { data: existing } = await supabase
    .from("candidate_matches")
    .select("candidate_id")
    .eq("posting_id", postingId)
  const done = new Set((existing || []).map((e) => e.candidate_id))

  let scored = 0
  const pending = candidates.filter((c) => !done.has(c.user_id) && c.parsed_resume)

  const scoreOne = async (c: (typeof pending)[number]) => {
    try {
      const result = await scoreCandidate(posting as JobPosting, { full_name: c.full_name, parsed_resume: c.parsed_resume })
      const { error } = await supabase.from("candidate_matches").insert({
        posting_id: postingId,
        candidate_id: c.user_id,
        match_score: result.score,
        match_reason: result.reason,
        matched_skills: result.matched_skills,
        missing_skills: result.missing_skills,
        status: "new",
      })
      if (!error) scored++
    } catch (err) {
      console.warn(`Candidate scoring failed for ${c.user_id}:`, err instanceof Error ? err.message : err)
    }
  }

  for (let i = 0; i < pending.length; i += 6) {
    await Promise.all(pending.slice(i, i + 6).map(scoreOne))
  }

  return { scored }
}
