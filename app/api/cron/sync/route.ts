import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { syncAllJobs, DEFAULT_QUERIES } from "@/lib/agents/jobFetcher"
import { matchJobsForUser } from "@/lib/agents/matchingAgent"
import { sendMatchDigest } from "@/lib/email"
import { Match } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json({ error: "Cron is not configured." }, { status: 503 })
    }

    const authHeader = request.headers.get("Authorization")
    const querySecret = searchParams.get("secret")

    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      querySecret === cronSecret

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceClient()

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("target_roles, target_country, parsed_resume")
    const queryPool = new Set<string>()
    const countryPool = new Set<string>()
    for (const p of (allProfiles ?? [])) {
      const explicit = Array.isArray(p.target_roles) ? p.target_roles.filter(Boolean) : []
      if (explicit.length > 0) {
        explicit.forEach((q: string) => queryPool.add(q))
      } else if (p.parsed_resume?.target_role) {
        queryPool.add(p.parsed_resume.target_role)
      }
      if (p.target_country) countryPool.add(p.target_country)
    }
    const queries = queryPool.size > 0 ? Array.from(queryPool) : undefined
    const countries = countryPool.size > 0 ? Array.from(countryPool) : undefined

    const fetchStats = await syncAllJobs(queries, countries)

    await syncAllJobs(DEFAULT_QUERIES, ["IN"], { sources: ["adzuna"] })

    const { data: targetProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, match_threshold, email_notifications")
      .eq("email_notifications", true)

    if (profilesError) {
      throw new Error(`Failed to load target profiles: ${profilesError.message}`)
    }

    const matchStats: Record<string, { matched: number; skipped: number }> = {}
    const emailStats: { sent: number; skipped: number; failed: number } = { sent: 0, skipped: 0, failed: 0 }

    if (targetProfiles && targetProfiles.length > 0) {
      for (const profile of targetProfiles) {
        try {
          const stats = await matchJobsForUser(profile.user_id)
          matchStats[profile.user_id] = stats

          if (!profile.email_notifications || !profile.email || stats.matched === 0) {
            emailStats.skipped++
            continue
          }

          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: freshMatches } = await supabase
            .from("matches")
            .select(`*, job:jobs(*)`)
            .eq("user_id", profile.user_id)
            .gte("match_score", profile.match_threshold ?? 70)
            .gte("created_at", since)
            .order("match_score", { ascending: false })
            .limit(20)

          const matches = (freshMatches as Match[] | null) ?? []
          if (matches.length === 0) {
            emailStats.skipped++
            continue
          }

          const result = await sendMatchDigest({
            to: profile.email,
            name: profile.full_name || "",
            matches,
          })
          if (result.sent) emailStats.sent++
          else {
            emailStats.failed++
            console.warn(`Digest email failed for ${profile.user_id}: ${result.reason}`)
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error(`Cron processing failed for user ${profile.user_id}:`, errMsg)
        }
      }
    }

    return NextResponse.json({
      success: true,
      jobSync: fetchStats,
      matchingSync: matchStats,
      emailSync: emailStats,
    })
  } catch (err: unknown) {
    console.error("Cron orchestrator execution failed:", err)
    const errMsg = err instanceof Error ? err.message : "Cron sync pipeline failed"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
