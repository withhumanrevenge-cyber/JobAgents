import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCreditState } from "@/lib/usage"
import { CREDIT_COST, PLAN_CONFIG } from "@/lib/plans"

// The signed-in user's plan, credit balance this month, and the per-action credit costs.
// Powers the billing panel's "X / Y credits left" indicator.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const state = await getCreditState(user.id)

  return NextResponse.json({
    plan: state.plan,
    credits: { allotment: state.allotment, used: state.used, remaining: state.remaining },
    costs: CREDIT_COST,
    maxVisibleMatches: PLAN_CONFIG[state.plan].maxVisibleMatches,
  })
}
