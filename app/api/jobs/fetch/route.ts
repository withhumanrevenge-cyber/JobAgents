import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncAllJobs } from "@/lib/agents/jobFetcher"
import { effectivePlan, PLAN_CONFIG } from "@/lib/plans"
import { COUNTRIES } from "@/lib/countries"
import { JobSource } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("parsed_resume, target_roles, target_country, plan, plan_expires_at")
      .eq("user_id", user.id)
      .single()

    if (profileErr) {
      console.error("Profile load failed in /api/jobs/fetch:", profileErr.message)
      return NextResponse.json({ error: `Profile load failed: ${profileErr.message}` }, { status: 500 })
    }

    const explicit: string[] = Array.isArray(profile?.target_roles) ? profile.target_roles.filter(Boolean) : []
    const inferred = profile?.parsed_resume?.target_role as string | undefined
    const queries: string | string[] | undefined = explicit.length > 0 ? explicit : inferred

    const body = await request.json().catch(() => ({}))
    const requested = typeof body?.country === "string" ? body.country.toUpperCase() : undefined
    const override = requested && COUNTRIES.some((c) => c.code === requested) ? requested : undefined
    const country = override || profile?.target_country || undefined

    const plan = effectivePlan(profile ?? {})
    const sources: JobSource[] = PLAN_CONFIG[plan].allSources
      ? ["remotive", "adzuna", "jsearch"]
      : ["remotive"]

    const stats = await syncAllJobs(queries, country, { sources })
    return NextResponse.json({
      ...stats,
      country: country || "US",
      queries: Array.isArray(queries) ? queries : queries ? [queries] : ["default"],
    })
  } catch (err: unknown) {
    console.error("Error in job sync API:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to sync jobs"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
