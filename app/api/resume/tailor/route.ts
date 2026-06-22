import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateTailoredResume } from "@/lib/agents/resumeAgent"

export async function POST(request: Request) {
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

    const resumeJson = await generateTailoredResume(user.id, job_id)
    return NextResponse.json({ resume_json: resumeJson })
  } catch (err: unknown) {
    console.error("Error tailoring resume:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to tailor resume"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
