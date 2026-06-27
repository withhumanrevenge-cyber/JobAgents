import { NextResponse } from "next/server"
import crypto from "crypto"
import { applyPlan, revokeBySubscription } from "@/lib/billing/grant"
import { planFromLemonVariant } from "@/lib/billing/config"

// Lemon Squeezy webhook. Verifies the HMAC signature, then flips the user's plan.
// Configure in LS dashboard: URL = {APP_URL}/api/webhooks/lemonsqueezy, secret = LEMONSQUEEZY_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const raw = await request.text()
  const signature = request.headers.get("x-signature") || ""
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex")

  // Constant-time compare to avoid timing attacks.
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(raw)
  const eventName: string = event?.meta?.event_name ?? ""
  const userId: string | undefined = event?.meta?.custom_data?.user_id
  const attrs = event?.data?.attributes ?? {}
  const variantId = attrs?.variant_id ?? attrs?.first_order_item?.variant_id
  const subscriptionId = String(event?.data?.id ?? "")
  const customerId = String(attrs?.customer_id ?? "")

  try {
    if (["subscription_created", "subscription_updated", "subscription_payment_success"].includes(eventName)) {
      if (!userId) return NextResponse.json({ ok: true })
      const plan = planFromLemonVariant(variantId) ?? "pro"
      // renews_at / ends_at is the current period end for active subscriptions.
      const expiresAt = attrs?.renews_at || attrs?.ends_at || null
      await applyPlan({ userId, plan, provider: "lemonsqueezy", customerId, subscriptionId, expiresAt })
    } else if (["subscription_cancelled", "subscription_expired"].includes(eventName)) {
      if (subscriptionId) await revokeBySubscription(subscriptionId)
    }
  } catch (err) {
    console.error("Lemon Squeezy webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
