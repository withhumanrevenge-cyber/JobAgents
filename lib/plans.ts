import { Plan, UsageAction } from "@/types"
// Shared with the Python backend, which enforces these limits. One file, so the UI can't drift.
import plans from "@/backend/app/plans.json"

export interface PlanConfig {
  // Hosted-AI credits a month. With their own AI key, users spend none.
  credits: number
  matchPerRun: number
  // Free users without a key: jobs scored per search and per day on our AI.
  trialMatchPerRun: number
  trialMatchPerDay: number
  maxVisibleMatches: number
  // Proof of Fit runs a month. They always run on our AI, so every candidate is graded alike.
  proofsPerMonth: number
  allSources: boolean
  allCountries: boolean
  label: string
  priceUsd: number
  priceInrPaise: number
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = plans.plans

export const CREDIT_COST: Record<UsageAction, number> = plans.creditCost

export const ACTION_LABEL: Record<UsageAction, string> = plans.actionLabel

export const PLAN_LABEL: Record<Plan, string> = {
  free: PLAN_CONFIG.free.label,
  pro: PLAN_CONFIG.pro.label,
  premium: PLAN_CONFIG.premium.label,
}

export function effectivePlan(profile: { plan?: string | null; plan_expires_at?: string | null }): Plan {
  const raw = profile.plan
  const plan: Plan = raw === "pro" ? "pro" : raw === "premium" || raw === "lifetime" ? "premium" : "free"
  if (plan !== "free" && profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() < Date.now()) {
    return "free"
  }
  return plan
}
