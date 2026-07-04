import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { matchJobsForUser } from "@/lib/agents/matchingAgent"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await matchJobsForUser(user.id)
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error("Error in job matching API:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to score jobs"
    const needsResume = errMsg.includes("Upload your resume")
    return NextResponse.json({ error: errMsg }, { status: needsResume ? 400 : 500 })
  }
}
