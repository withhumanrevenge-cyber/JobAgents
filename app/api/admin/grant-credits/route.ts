import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAdminUser } from "@/lib/admin"

// Grants bonus credits to a user this month. Stored as a negative-credit ledger row so it
// reduces their "credits used" total — i.e. increases what's remaining against their allotment.
export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { user_id, amount } = await request.json()
  const credits = Number(amount)
  if (!user_id || !Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ error: "user_id and a positive amount are required." }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc
    .from("usage_events")
    .insert({ user_id, action: "admin_grant", credits: -credits, tokens: 0 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, granted: credits })
}
