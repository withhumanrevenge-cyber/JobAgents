import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendMatchDigest, sendTestEmail } from "@/lib/email"
import { Match } from "@/types"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const mode: "digest" | "test" = body.mode === "test" ? "test" : "digest"

    const service = createServiceClient()
    const { data: profile } = await service
      .from("profiles")
      .select("full_name, email, match_threshold")
      .eq("user_id", user.id)
      .single()

    const toEmail = profile?.email || user.email || ""
    if (!toEmail) {
      return NextResponse.json({ error: "Add an email address in settings first." }, { status: 400 })
    }

    if (mode === "test") {
      const result = await sendTestEmail(toEmail, profile?.full_name || "")
      if (!result.sent) {
        return NextResponse.json({ error: result.reason || "Failed to send." }, { status: 500 })
      }
      return NextResponse.json({ sent: true, to: toEmail })
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: matches } = await service
      .from("matches")
      .select(`*, job:jobs(*)`)
      .eq("user_id", user.id)
      .gte("match_score", profile?.match_threshold ?? 70)
      .gte("created_at", since)
      .order("match_score", { ascending: false })
      .limit(20)

    const list = (matches as Match[] | null) ?? []
    if (list.length === 0) {
      return NextResponse.json({ sent: false, reason: "No new matches above your threshold in the last 7 days." }, { status: 200 })
    }

    const result = await sendMatchDigest({ to: toEmail, name: profile?.full_name || "", matches: list })
    if (!result.sent) {
      return NextResponse.json({ error: result.reason || "Failed to send." }, { status: 500 })
    }
    return NextResponse.json({ sent: true, to: toEmail, count: list.length })
  } catch (err: unknown) {
    console.error("Digest email error:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to send digest."
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
