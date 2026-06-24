import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { generateTailoredResume } from "@/lib/agents/resumeAgent"
import { generateCoverLetter } from "@/lib/agents/coverLetterAgent"
import { gateAction, refundUsage } from "@/lib/usage"
import { Job, ParsedResume, ResumeData } from "@/types"

// Two sequential 70B Groq calls (tailor + cover letter) — needs more than the default serverless timeout.
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  let consumedUserId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { job_id } = await request.json()
    if (!job_id) {
      return NextResponse.json({ error: "Missing job_id" }, { status: 400 })
    }

    const service = createServiceClient()

    const { data: job, error: jobError } = await service.from("jobs").select("*").eq("id", job_id).single()
    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const { data: profile } = await service
      .from("profiles")
      .select("parsed_resume")
      .eq("user_id", user.id)
      .single()

    const parsedResume: ParsedResume | null = profile?.parsed_resume ?? null

    // Consume quota right before the paid work, so validation failures above never cost the user.
    const gate = await gateAction(user.id, "smart_apply")
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message, upgrade: true }, { status: 402 })
    }
    consumedUserId = user.id

    const tailoredResume: ResumeData = await generateTailoredResume(user.id, job_id)

    const coverLetter = await generateCoverLetter({
      job: job as Job,
      parsedResume,
      tailoredResume,
      userId: user.id,
    })

    await service
      .from("matches")
      .update({
        cover_letter: coverLetter,
        cover_letter_generated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("job_id", job_id)

    return NextResponse.json({
      apply_url: job.url,
      tailored_resume: tailoredResume,
      cover_letter: coverLetter,
    })
  } catch (err: unknown) {
    if (consumedUserId) await refundUsage(consumedUserId, "smart_apply")
    console.error("Smart apply error:", err)
    const errMsg = err instanceof Error ? err.message : "Smart apply failed."
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
