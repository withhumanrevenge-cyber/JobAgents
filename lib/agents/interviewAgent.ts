import { callGroq, parseJsonFromGroq } from "@/lib/groq"
import { InterviewQuestion, ParsedResume } from "@/types"

export async function generateInterviewQuestions(
  jobTitle: string,
  jobCompany: string,
  jobDescription: string,
  parsedResume: ParsedResume | null
): Promise<InterviewQuestion[]> {
  const systemPrompt = `You are an expert interview coach at a top tech company. Generate realistic, specific interview questions tailored to the job description and candidate background.
Return ONLY a JSON array of exactly 10 questions:
[
  {
    "question": "<specific interview question>",
    "category": "<technical|behavioral|role-specific|situational>",
    "tip": "<short coaching tip: what key points to cover in the answer>"
  }
]
Include a mix: 3 technical, 3 behavioral, 2 role-specific, 2 situational.
Make questions specific to the company, role, and candidate's background. No generic filler questions.
Return only valid JSON — no markdown, no extra text.`

  const candidateContext = parsedResume
    ? `Target Role: ${parsedResume.target_role}
Years of Experience: ${parsedResume.years_experience}
Key Skills: ${parsedResume.skills.slice(0, 15).join(", ")}
Current/Last Role: ${parsedResume.experience[0]?.title || "N/A"} at ${parsedResume.experience[0]?.company || "N/A"}
Education: ${parsedResume.education[0]?.degree || "N/A"} from ${parsedResume.education[0]?.school || "N/A"}`
    : "No resume provided — generate general questions for the role."

  const userPrompt = `JOB DETAILS:
Title: ${jobTitle}
Company: ${jobCompany}
Description:
${jobDescription?.slice(0, 2500) || "No description provided"}

CANDIDATE PROFILE:
${candidateContext}

Generate 10 targeted interview questions for this specific role and candidate.`

  try {
    const response = await callGroq(userPrompt, systemPrompt)
    const parsed = parseJsonFromGroq<InterviewQuestion[]>(response)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
  } catch (err) {
    console.error("Interview generation failed:", err)
  }

  return getFallbackQuestions(jobTitle)
}

function getFallbackQuestions(jobTitle: string): InterviewQuestion[] {
  return [
    {
      question: `Walk me through your most complex project related to ${jobTitle}.`,
      category: "technical",
      tip: "Detail your technical decisions, trade-offs made, and the business impact.",
    },
    {
      question: "Describe a time you had to learn a new technology quickly under pressure.",
      category: "behavioral",
      tip: "Use STAR method. Show initiative, speed of learning, and outcome.",
    },
    {
      question: "How do you approach debugging a hard-to-reproduce production bug?",
      category: "technical",
      tip: "Cover: reproduction steps, logging strategy, hypothesis testing, fix, and prevention.",
    },
    {
      question: "Tell me about a time you disagreed with a technical decision and how you handled it.",
      category: "behavioral",
      tip: "Show diplomatic communication, data-driven reasoning, and teamwork.",
    },
    {
      question: "How do you ensure code quality in a fast-moving team?",
      category: "role-specific",
      tip: "Mention: code review culture, testing strategy, CI/CD, documentation.",
    },
    {
      question: "If you joined and found the codebase had significant technical debt, what would you do first?",
      category: "situational",
      tip: "Show pragmatism: assess impact, prioritize, communicate trade-offs, don't just rewrite everything.",
    },
    {
      question: "Explain a complex technical concept you recently learned in simple terms.",
      category: "technical",
      tip: "Shows communication skills and ability to teach peers — use an analogy.",
    },
    {
      question: "Describe your ideal engineering team and work environment.",
      category: "behavioral",
      tip: "Be genuine but align with collaboration, clear ownership, and growth opportunities.",
    },
    {
      question: "How do you prioritize when you have multiple urgent tasks?",
      category: "situational",
      tip: "Show: impact assessment, stakeholder communication, and systematic triage.",
    },
    {
      question: "What excites you most about this role and what would you work on in your first 30 days?",
      category: "role-specific",
      tip: "Research the company's product and show you've thought about where you'd add value quickly.",
    },
  ]
}
