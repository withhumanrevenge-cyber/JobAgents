import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAdminUser } from "@/lib/admin"

export interface AdminUserRow {
  user_id: string
  email: string | null
  full_name: string | null
  plan: string
  plan_expires_at: string | null
  is_admin: boolean
  created_at: string | null
  smart_apply: number
  tailor: number
  interview: number
  credits: number
  tokens: number
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const svc = createServiceClient()
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()

  const { data: profiles } = await svc
    .from("profiles")
    .select("user_id, email, full_name, plan, plan_expires_at, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  // Pull this month's usage once, then bucket per user in memory (cheap for early scale).
  const { data: usage } = await svc
    .from("usage_events")
    .select("user_id, action, tokens, credits")
    .gte("created_at", monthStart)

  const buckets = new Map<string, { smart_apply: number; tailor: number; interview: number; credits: number; tokens: number }>()
  for (const e of usage ?? []) {
    const b = buckets.get(e.user_id) ?? { smart_apply: 0, tailor: 0, interview: 0, credits: 0, tokens: 0 }
    if (e.action === "smart_apply") b.smart_apply++
    else if (e.action === "tailor") b.tailor++
    else if (e.action === "interview") b.interview++
    b.credits += e.credits ?? 0
    b.tokens += e.tokens ?? 0
    buckets.set(e.user_id, b)
  }

  const rows: AdminUserRow[] = (profiles ?? []).map((p) => {
    const b = buckets.get(p.user_id) ?? { smart_apply: 0, tailor: 0, interview: 0, credits: 0, tokens: 0 }
    return {
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      plan: p.plan ?? "free",
      plan_expires_at: p.plan_expires_at,
      is_admin: p.is_admin ?? false,
      created_at: p.created_at,
      ...b,
    }
  })

  return NextResponse.json({ users: rows })
}
