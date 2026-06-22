import { createServiceClient } from "@/lib/supabase/server"
import { callGroq, parseJsonFromGroq } from "@/lib/groq"
import { ResumeData, ParsedResume } from "@/types"

function computeAtsScore(resume: ResumeData, jobDescription: string, jobTags: string[]): number {
  const resumeText = [
    resume.summary,
    resume.skills.join(" "),
    resume.experience.map((e) => `${e.title} ${e.bullets.join(" ")}`).join(" "),
    resume.projects?.map((p) => `${p.name} ${p.description} ${p.tech.join(" ")}`).join(" ") || "",
  ]
    .join(" ")
    .toLowerCase()

  const keywords = [
    ...jobTags,
    ...jobDescription
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4),
  ]

  const uniqueKeywords = [...new Set(keywords)]
  if (uniqueKeywords.length === 0) return 0

  const matched = uniqueKeywords.filter((kw) => resumeText.includes(kw.toLowerCase()))
  return Math.min(99, Math.round((matched.length / uniqueKeywords.length) * 100))
}

export async function generateTailoredResume(userId: string, jobId: string): Promise<ResumeData> {
  const supabase = createServiceClient()

  const { data: job, error: jobError } = await supabase.from("jobs").select("*").eq("id", jobId).single()
  if (jobError || !job) throw new Error(`Job not found: ${jobId}`)

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single()
  if (profileError || !profile) throw new Error(`Profile not found for user: ${userId}`)

  const parsedResume: ParsedResume | null = profile.parsed_resume ?? null

  const supabaseUser = await supabase.auth.getUser()
  const authEmail = supabaseUser.data.user?.email || ""

  // Build base resume from parsed resume if available, or from profile fields
  const baseResumeData: ResumeData = parsedResume
    ? {
        name: parsedResume.name || profile.full_name || "Candidate",
        email: parsedResume.email || profile.email || authEmail || "candidate@example.com",
        phone: parsedResume.phone || profile.phone || "",
        summary: parsedResume.summary,
        skills: parsedResume.skills,
        experience: parsedResume.experience,
        education: parsedResume.education,
        projects: parsedResume.projects || [],
      }
    : {
        name: profile.full_name || "Engineering Candidate",
        email: profile.email || authEmail || "candidate@example.com",
        phone: profile.phone || "",
        summary: "High-performing software engineer skilled in building modern, scalable web applications.",
        skills: ["React", "TypeScript", "Next.js", "JavaScript", "Node.js"],
        experience: [
          {
            company: "Previous Company",
            title: "Software Engineer",
            dates: "2022 - Present",
            bullets: [
              "Built responsive web applications using modern JavaScript frameworks.",
              "Collaborated in agile teams to deliver high-quality software on schedule.",
              "Improved system performance through code optimization and best practices.",
            ],
          },
        ],
        education: [{ school: "University", degree: "B.Sc. Computer Science", year: "2022" }],
        projects: [],
      }

  const systemPrompt = `You are a professional ATS-optimized resume writer specializing in tech roles.
Your task: take a job description and base resume, then rewrite the resume to maximize ATS score and relevance.
Rules:
- Keep all personal info (name, email, phone) EXACTLY as provided
- Rewrite summary to directly mirror the job's language and requirements
- Reorder/add skills to put the most relevant ones first
- Rephrase experience bullets to incorporate job keywords while staying truthful
- Tailor project descriptions to highlight relevant tech and impact
- Do NOT fabricate experience, companies, or degrees

Return ONLY a valid JSON object matching this exact shape:
{
  "name": "<string>",
  "email": "<string>",
  "phone": "<string>",
  "summary": "<tailored 2-3 sentence summary>",
  "skills": ["<skill>", ...],
  "experience": [{ "company": "<>", "title": "<>", "dates": "<>", "bullets": ["<>", ...] }],
  "education": [{ "school": "<>", "degree": "<>", "year": "<>" }],
  "projects": [{ "name": "<>", "description": "<>", "tech": ["<>"], "url": "<optional>" }]
}
No markdown. No text outside the JSON.`

  const userPrompt = `JOB:
Company: ${job.company}
Title: ${job.title}
Key Skills Required: ${job.tags.join(", ")}
Description:
${job.description?.slice(0, 2500) || "No description provided."}

BASE RESUME TO TAILOR:
${JSON.stringify(baseResumeData, null, 2)}`

  const response = await callGroq(userPrompt, systemPrompt)

  let tailoredData: ResumeData
  const parsed = parseJsonFromGroq<ResumeData>(response)
  if (parsed && parsed.name && parsed.skills) {
    tailoredData = parsed
  } else {
    console.error("Failed to parse tailored resume from Groq:", response.slice(0, 200))
    tailoredData = baseResumeData
  }

  // Compute ATS score and attach it
  tailoredData.ats_score = computeAtsScore(tailoredData, job.description || "", job.tags)

  await supabase
    .from("matches")
    .update({ tailored_resume_json: tailoredData })
    .eq("user_id", userId)
    .eq("job_id", jobId)

  return tailoredData
}
