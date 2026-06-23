import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans"
import { monthlyCount } from "@/lib/usage"

// The signed-in user's current plan + this month's usage vs limits. Powers the settings usage hints.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("user_id", user.id)
    .single()

  const plan = effectivePlan(profile ?? {})
  const limits = PLAN_LIMITS[plan]

  const [smart_apply, tailor, interview] = await Promise.all([
    monthlyCount(user.id, "smart_apply"),
    monthlyCount(user.id, "tailor"),
    monthlyCount(user.id, "interview"),
  ])

  // Unlimited limits (Infinity) become null — clients treat null as "no limit".
  const finiteOrNull = (n: number) => (isFinite(n) ? n : null)

  return NextResponse.json({
    plan,
    limits: {
      smart_apply: finiteOrNull(limits.smart_apply),
      tailor: finiteOrNull(limits.tailor),
      interview: finiteOrNull(limits.interview),
    },
    used: { smart_apply, tailor, interview },
  })
}
