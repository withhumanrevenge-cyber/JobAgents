import { Plan, UsageAction } from "@/types"

export interface PlanConfig {
  credits: number        // monthly credit allotment
  matchPerRun: number    // jobs scored per "Find jobs" run
  maxVisibleMatches: number // how many matched jobs the tier can see in the feed
  allSources: boolean
  allCountries: boolean
  label: string
  priceUsd: number       // 0 for free
}

// Tier definitions. Each tier grants a monthly pool of credits (spent on AI actions) AND
// a cap on how many job matches are visible in the feed — upgrading unlocks more jobs.
// Tune these numbers freely — the architecture doesn't care about the exact values.
export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { credits: 15,  matchPerRun: 50,  maxVisibleMatches: 25,   allSources: false, allCountries: false, label: "Free",    priceUsd: 0 },
  pro:     { credits: 100, matchPerRun: 150, maxVisibleMatches: 150,  allSources: true,  allCountries: true,  label: "Pro",     priceUsd: 12 },
  premium: { credits: 300, matchPerRun: 300, maxVisibleMatches: 2000, allSources: true,  allCountries: true,  label: "Premium", priceUsd: 24 },
}

// What each AI action costs in credits. Roughly proportional to API spend (bump these when moving to Claude).
// Job matching and resume parsing are free — they're the acquisition hook.
export const CREDIT_COST: Record<UsageAction, number> = {
  smart_apply: 3,
  tailor: 2,
  interview: 2,
}

export const ACTION_LABEL: Record<UsageAction, string> = {
  smart_apply: "Smart Apply",
  tailor: "Resume tailor",
  interview: "Interview prep",
}

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
}

// Normalizes the stored plan. Legacy 'lifetime' rows map to premium. An expired paid plan falls back to free.
export function effectivePlan(profile: { plan?: string | null; plan_expires_at?: string | null }): Plan {
  const raw = profile.plan
  const plan: Plan = raw === "pro" ? "pro" : raw === "premium" || raw === "lifetime" ? "premium" : "free"
  if (plan !== "free" && profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() < Date.now()) {
    return "free"
  }
  return plan
}
