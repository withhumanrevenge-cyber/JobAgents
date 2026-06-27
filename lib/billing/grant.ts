import { createServiceClient } from "@/lib/supabase/server"
import { Plan } from "@/types"

type Provider = "razorpay" | "lemonsqueezy"

interface GrantArgs {
  userId: string
  plan: Plan
  provider: Provider
  customerId?: string | null
  subscriptionId?: string | null
  // Pro subscriptions: the current period end. Lifetime: ignored (no expiry).
  expiresAt?: string | null
}

// Single source of truth for granting a paid plan. Every webhook (Razorpay or Lemon Squeezy)
// funnels through here, so entitlement logic lives in exactly one place.
export async function applyPlan({ userId, plan, provider, customerId, subscriptionId, expiresAt }: GrantArgs): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc
    .from("profiles")
    .update({
      plan,
      plan_expires_at: expiresAt ?? null,
      billing_provider: provider,
      billing_customer_id: customerId ?? null,
      billing_subscription_id: subscriptionId ?? null,
    })
    .eq("user_id", userId)
  if (error) console.error("applyPlan failed:", error.message)
}

// Drop a user back to free when a subscription is cancelled or expires. Matched by subscription id.
export async function revokeBySubscription(subscriptionId: string): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc
    .from("profiles")
    .update({ plan: "free", plan_expires_at: null })
    .eq("billing_subscription_id", subscriptionId)
  if (error) console.error("revokeBySubscription failed:", error.message)
}
