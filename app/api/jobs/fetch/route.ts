import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncAllJobs } from "@/lib/agents/jobFetcher"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("parsed_resume, target_roles, target_country")
      .eq("user_id", user.id)
      .single()

    if (profileErr) {
      console.error("Profile load failed in /api/jobs/fetch:", profileErr.message)
      return NextResponse.json({ error: `Profile load failed: ${profileErr.message}` }, { status: 500 })
    }

    // User-set target roles take precedence; fall back to what the parser inferred.
    const explicit: string[] = Array.isArray(profile?.target_roles) ? profile.target_roles.filter(Boolean) : []
    const inferred = profile?.parsed_resume?.target_role as string | undefined
    const queries: string | string[] | undefined = explicit.length > 0 ? explicit : inferred

    const country = profile?.target_country || undefined

    const stats = await syncAllJobs(queries, country)
    return NextResponse.json({
      ...stats,
      country: country || "US (default)",
      queries: Array.isArray(queries) ? queries : queries ? [queries] : ["default"],
    })
  } catch (err: unknown) {
    console.error("Error in job sync API:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to sync jobs"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
