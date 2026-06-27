import { NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { razorpayPlanId } from "@/lib/billing/config"
import { Plan } from "@/types"

// Creates a Razorpay subscription for Pro or Premium. Returns the ids the client needs to open
// Razorpay Checkout. user_id + plan are stored in `notes` so the webhook can map it back.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { plan } = await request.json() as { plan: Plan }
    if (plan !== "pro" && plan !== "premium") {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 })
    }

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 })
    }

    const planId = razorpayPlanId(plan)
    if (!planId) {
      return NextResponse.json({ error: `Razorpay ${plan} plan not configured.` }, { status: 503 })
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const sub = await rzp.subscriptions.create({
      plan_id: planId,
      total_count: 12,
      customer_notify: 1,
      notes: { user_id: user.id, plan },
    })

    return NextResponse.json({ provider: "razorpay", type: "subscription", subscription_id: sub.id, key_id: keyId })
  } catch (err: unknown) {
    console.error("Razorpay checkout error:", err)
    const msg = err instanceof Error ? err.message : "Checkout failed."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
