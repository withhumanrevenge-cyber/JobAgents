import { NextResponse } from "next/server"
import crypto from "crypto"
import { applyPlan, revokeBySubscription } from "@/lib/billing/grant"

// Razorpay webhook. Verifies x-razorpay-signature, then flips the user's plan.
// Configure in Razorpay dashboard: URL = {APP_URL}/api/webhooks/razorpay, secret = RAZORPAY_WEBHOOK_SECRET,
// events = subscription.activated, subscription.charged, subscription.cancelled, subscription.completed, order.paid.
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const raw = await request.text()
  const signature = request.headers.get("x-razorpay-signature") || ""
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex")

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(raw)
  const type: string = event?.event ?? ""

  try {
    if (type === "subscription.activated" || type === "subscription.charged") {
      const sub = event?.payload?.subscription?.entity
      const userId = sub?.notes?.user_id
      if (userId) {
        // current_end is a unix timestamp (seconds) for the period end.
        const expiresAt = sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : null
        await applyPlan({ userId, plan: "pro", provider: "razorpay", subscriptionId: sub?.id ?? null, customerId: sub?.customer_id ?? null, expiresAt })
      }
    } else if (type === "order.paid") {
      // One-time Lifetime purchases. order.paid carries the ORDER entity, which has the notes we set
      // at order creation (payment.captured does NOT carry order notes, so we must use this event).
      const order = event?.payload?.order?.entity
      const notes = order?.notes ?? {}
      if (notes.plan === "lifetime" && notes.user_id) {
        await applyPlan({ userId: notes.user_id, plan: "lifetime", provider: "razorpay", subscriptionId: null, customerId: null, expiresAt: null })
      }
    } else if (type === "subscription.cancelled" || type === "subscription.completed" || type === "subscription.halted") {
      const sub = event?.payload?.subscription?.entity
      if (sub?.id) await revokeBySubscription(sub.id)
    }
  } catch (err) {
    console.error("Razorpay webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
