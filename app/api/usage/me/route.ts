import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCreditState } from "@/lib/usage"
import { CREDIT_COST, PLAN_CONFIG } from "@/lib/plans"
import { detectCurrency } from "@/lib/marketing/geo"
import { getPricingTiers } from "@/lib/marketing/pricing"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const state = await getCreditState(user.id)

  const currency = await detectCurrency()
  const priceByName = Object.fromEntries(getPricingTiers(currency).map((t) => [t.name.toLowerCase(), t.priceLabel]))

  return NextResponse.json({
    plan: state.plan,
    credits: { allotment: state.allotment, used: state.used, remaining: state.remaining },
    costs: CREDIT_COST,
    maxVisibleMatches: PLAN_CONFIG[state.plan].maxVisibleMatches,
    prices: {
      pro: priceByName["pro"] ?? `$${PLAN_CONFIG.pro.priceUsd}`,
      premium: priceByName["premium"] ?? `$${PLAN_CONFIG.premium.priceUsd}`,
    },
    processors: {
      razorpay: !!process.env.RAZORPAY_KEY_ID,
      lemonsqueezy: !!process.env.LEMONSQUEEZY_API_KEY,
    },
  })
}
