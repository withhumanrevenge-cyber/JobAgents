import { PLAN_CONFIG, CREDIT_COST, ACTION_LABEL } from "@/lib/plans"
import { PRICING } from "@/lib/billing/config"
import type { UsageAction } from "@/types"

export type Currency = "USD" | "INR"

export interface MarketingTier {
  name: string
  priceLabel: string
  period: string
  description: string
  features: string[]
  cta: string
  href: string
  featured: boolean
}

const fmt = (n: number) => n.toLocaleString("en-US")

function priceLabel(currency: Currency, usd: number, inrPaise: number): string {
  if (usd === 0) return currency === "INR" ? "₹0" : "$0"
  return currency === "INR"
    ? `₹${Math.round(inrPaise / 100).toLocaleString("en-IN")}`
    : `$${usd}`
}

export function getPricingTiers(currency: Currency = "USD"): MarketingTier[] {
  return [
    {
      name: PLAN_CONFIG.free.label,
      priceLabel: priceLabel(currency, 0, 0),
      period: "forever",
      description: "Everything you need to start your search.",
      features: [
        `${PLAN_CONFIG.free.credits} credits / month`,
        `Up to ${fmt(PLAN_CONFIG.free.maxVisibleMatches)} job matches in your feed`,
        `${PLAN_CONFIG.free.matchPerRun} jobs scored per search`,
        "Adzuna jobs (broad market)",
        "Resume parsing & match scoring — free",
        "Application tracker",
      ],
      cta: "Get started",
      href: "/signup",
      featured: false,
    },
    {
      name: PLAN_CONFIG.pro.label,
      priceLabel: priceLabel(currency, PLAN_CONFIG.pro.priceUsd, PRICING.proInrPaise),
      period: "per month",
      description: "For active job seekers who want every edge.",
      features: [
        `${PLAN_CONFIG.pro.credits} credits / month`,
        `Up to ${fmt(PLAN_CONFIG.pro.maxVisibleMatches)} job matches in your feed`,
        `${PLAN_CONFIG.pro.matchPerRun} jobs scored per search`,
        "All sources — Adzuna + direct ATS (Greenhouse, Lever, Ashby)",
        "All countries",
        "Smart Apply, resume tailoring & interview prep",
        "Email alerts for new matches",
      ],
      cta: "Upgrade to Pro",
      href: "/signup",
      featured: true,
    },
    {
      name: PLAN_CONFIG.premium.label,
      priceLabel: priceLabel(currency, PLAN_CONFIG.premium.priceUsd, PRICING.premiumInrPaise),
      period: "per month",
      description: "Maximum volume for a full-time search.",
      features: [
        `${PLAN_CONFIG.premium.credits} credits / month`,
        `Up to ${fmt(PLAN_CONFIG.premium.maxVisibleMatches)} job matches in your feed`,
        `${PLAN_CONFIG.premium.matchPerRun} jobs scored per search`,
        "Everything in Pro",
        "Priority processing",
      ],
      cta: "Go Premium",
      href: "/signup",
      featured: false,
    },
  ]
}

export const CREDIT_SUMMARY =
  (Object.keys(CREDIT_COST) as UsageAction[])
    .map((a) => `${ACTION_LABEL[a]} ${CREDIT_COST[a]}`)
    .join(" · ") + " credits · matching is free"
