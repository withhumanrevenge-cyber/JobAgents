import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { generateInterviewQuestions } from "@/lib/agents/interviewAgent"
import { gateAction, refundUsage } from "@/lib/usage"
import { ParsedResume } from "@/types"

export async function POST(request: Request) {
  let consumedUserId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { match_id, job_id } = body

    if (!match_id && !job_id) {
      return NextResponse.json({ error: "match_id or job_id is required." }, { status: 400 })
    }

    const service = createServiceClient()

    // Fetch the job details
    const { data: job, error: jobErr } = await service
      .from("jobs")
      .select("*")
      .eq("id", job_id || (await getJobIdFromMatch(service, match_id)))
      .single()

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 })
    }

    // Fetch parsed resume from profile
    const { data: profile } = await service
      .from("profiles")
      .select("parsed_resume")
      .eq("user_id", user.id)
      .single()

    const parsedResume: ParsedResume | null = profile?.parsed_resume ?? null

    // Consume quota right before the paid work, so validation failures above never cost the user.
    const gate = await gateAction(user.id, "interview")
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message, upgrade: true }, { status: 402 })
    }
    consumedUserId = user.id

    const questions = await generateInterviewQuestions(
      job.title,
      job.company,
      job.description || "",
      parsedResume,
      user.id
    )

    // Save to match record if we have a real match_id
    if (match_id && !match_id.startsWith("pending-")) {
      await service
        .from("matches")
        .update({
          interview_questions: questions,
          interview_generated_at: new Date().toISOString(),
        })
        .eq("id", match_id)
        .eq("user_id", user.id)
    }

    return NextResponse.json({ questions })
  } catch (err: unknown) {
    if (consumedUserId) await refundUsage(consumedUserId, "interview")
    console.error("Interview generation error:", err)
    const msg = err instanceof Error ? err.message : "Failed to generate interview questions."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function getJobIdFromMatch(service: ReturnType<typeof createServiceClient>, matchId: string): Promise<string> {
  const { data } = await service.from("matches").select("job_id").eq("id", matchId).single()
  return data?.job_id || ""
}
