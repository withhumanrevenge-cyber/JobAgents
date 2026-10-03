import { NextResponse } from "next/server"
import crypto from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { applyPlan, revokeBySubscription } from "@/lib/billing/grant"

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
  const eventId: string = event?.id ?? ""

  // Idempotency: check if we've already processed this event
  const svc = createServiceClient()
  if (eventId) {
    const { data: existing } = await svc
      .from("webhook_events")
      .select("id")
      .eq("provider", "razorpay")
      .eq("event_id", eventId)
      .single()
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true })
    }
  }

  try {
    if (type === "subscription.activated" || type === "subscription.charged") {
      const sub = event?.payload?.subscription?.entity
      const userId = sub?.notes?.user_id
      const plan = sub?.notes?.plan === "premium" ? "premium" : "pro"
      if (userId) {
        const expiresAt = sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : null
        await applyPlan({ userId, plan, provider: "razorpay", subscriptionId: sub?.id ?? null, customerId: sub?.customer_id ?? null, expiresAt })
      }
    } else if (type === "subscription.cancelled" || type === "subscription.completed" || type === "subscription.halted") {
      const sub = event?.payload?.subscription?.entity
      if (sub?.id) await revokeBySubscription(sub.id)
    }
  } catch (err) {
    console.error("Razorpay webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  // Record processed event
  if (eventId) {
    await svc.from("webhook_events").insert({
      provider: "razorpay",
      event_id: eventId,
      event_type: type,
      payload: event,
    })
  }

  return NextResponse.json({ ok: true })
}
