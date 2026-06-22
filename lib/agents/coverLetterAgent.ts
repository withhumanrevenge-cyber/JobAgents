import { callGroq } from "@/lib/groq"
import { Job, ParsedResume, ResumeData } from "@/types"

interface CoverLetterArgs {
  job: Job
  parsedResume: ParsedResume | null
  tailoredResume: ResumeData | null
}

export async function generateCoverLetter({ job, parsedResume, tailoredResume }: CoverLetterArgs): Promise<string> {
  const candidateName = tailoredResume?.name || parsedResume?.name || "Candidate"
  const candidateSummary = tailoredResume?.summary || parsedResume?.summary || ""
  const skills = (tailoredResume?.skills || parsedResume?.skills || []).slice(0, 8).join(", ")
  const recentRole = parsedResume?.experience?.[0]
    ? `${parsedResume.experience[0].title} at ${parsedResume.experience[0].company}`
    : ""

  const systemPrompt = `You write short, confident cover letters for job applications. Strict rules:
- Exactly 3 paragraphs, 90-120 words total.
- Paragraph 1: one sentence stating the role + company, one sentence on why this candidate is a fit.
- Paragraph 2: one or two concrete achievements or skills tied to the job's requirements. No fabrication — only use facts from the candidate context.
- Paragraph 3: one sentence on enthusiasm + a clear ask to discuss further.
- No "Dear Hiring Manager" salutation, no "Sincerely" sign-off — those get added separately.
- No clichés: avoid "passionate", "dynamic", "synergy", "hit the ground running", "team player".
- No em-dashes. Use periods.
- Plain prose, no markdown, no bullet points.
Return the body text only.`

  const userPrompt = `JOB
Title: ${job.title}
Company: ${job.company}
Description: ${(job.description || "").slice(0, 1500)}
Required skills/tags: ${job.tags.join(", ")}

CANDIDATE
Name: ${candidateName}
Recent role: ${recentRole}
Top skills: ${skills}
Summary: ${candidateSummary}

Write the cover letter body.`

  const text = await callGroq(userPrompt, systemPrompt)
  return text.trim()
}
