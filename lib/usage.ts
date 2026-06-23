import { createServiceClient } from "@/lib/supabase/server"
import { UsageAction } from "@/types"
import { PLAN_LIMITS, effectivePlan } from "@/lib/plans"

// Start of the current calendar month (UTC) — the window quotas reset on.
function startOfMonthISO(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

// How many times the user has performed `action` this calendar month.
export async function monthlyCount(userId: string, action: UsageAction): Promise<number> {
  const svc = createServiceClient()
  const { count } = await svc
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", startOfMonthISO())
  return count ?? 0
}

// Record one metered (gated) action. Counts toward the user's plan limit.
export async function logUsage(userId: string, action: UsageAction, tokens = 0, model: string | null = null): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc.from("usage_events").insert({ user_id: userId, action, tokens, model })
  if (error) console.error("Failed to log usage event:", error.message)
}

// Record raw AI token consumption for cost accounting (action 'ai_call' — NOT a gated action,
// so it never affects quota counts). Fire-and-forget from the Groq layer.
export async function logTokens(userId: string, tokens: number, model: string): Promise<void> {
  if (!userId || !tokens) return
  const svc = createServiceClient()
  const { error } = await svc.from("usage_events").insert({ user_id: userId, action: "ai_call", tokens, model })
  if (error) console.error("Failed to log token usage:", error.message)
}

export interface QuotaResult {
  ok: boolean
  used: number
  limit: number
}

// Check whether the user is within their monthly limit for `action`. Infinity limit always passes.
export async function checkQuota(userId: string, action: UsageAction, limit: number): Promise<QuotaResult> {
  if (!isFinite(limit)) return { ok: true, used: 0, limit }
  const used = await monthlyCount(userId, action)
  return { ok: used < limit, used, limit }
}

// Standard upgrade message for a hit limit.
export function quotaMessage(action: UsageAction, limit: number): string {
  const label = action === "smart_apply" ? "Smart Applies" : action === "tailor" ? "resume tailors" : "interview preps"
  return `You've used all ${limit} free ${label} this month. Upgrade to Pro for unlimited.`
}

// Atomically check-and-consume one unit of quota. Returns true if consumed (a usage_event was logged),
// false if the user is already at their limit. Atomicity (via the consume_quota Postgres function +
// advisory lock) prevents two concurrent requests from both passing the same limit.
export async function consumeQuota(userId: string, action: UsageAction, limit: number): Promise<boolean> {
  // Unlimited plans: log for analytics, always allow.
  if (!isFinite(limit)) {
    await logUsage(userId, action)
    return true
  }
  const svc = createServiceClient()
  const { data, error } = await svc.rpc("consume_quota", {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
  })
  if (error) {
    // RPC not installed yet — fall back to a (non-atomic) check + log so gating still works pre-migration.
    console.warn("consume_quota RPC unavailable, falling back to non-atomic check:", error.message)
    const { ok } = await checkQuota(userId, action, limit)
    if (ok) await logUsage(userId, action)
    return ok
  }
  return data === true
}

// Reverses one consumed unit when the work fails after the quota was consumed (e.g. the AI call errored).
// Deletes the most recent matching event this month so a failed action doesn't cost the user.
export async function refundUsage(userId: string, action: UsageAction): Promise<void> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("usage_events")
    .select("id")
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", startOfMonthISO())
    .order("created_at", { ascending: false })
    .limit(1)
  const id = data?.[0]?.id
  if (id) await svc.from("usage_events").delete().eq("id", id)
}

// Loads the user's plan and atomically consumes one unit of quota for `action`.
// Returns { allowed, message } — routes return 402 with `message` when not allowed.
// IMPORTANT: this CONSUMES on success, so callers must refundUsage() if the subsequent work fails.
export async function gateAction(userId: string, action: UsageAction): Promise<{ allowed: boolean; message?: string }> {
  const svc = createServiceClient()
  const { data: profile } = await svc
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("user_id", userId)
    .single()

  const plan = effectivePlan(profile ?? {})
  const limit = PLAN_LIMITS[plan][action]
  const allowed = await consumeQuota(userId, action, limit)
  return allowed ? { allowed: true } : { allowed: false, message: quotaMessage(action, limit) }
}
