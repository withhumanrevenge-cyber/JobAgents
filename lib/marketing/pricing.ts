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
  const free = PLAN_CONFIG.free
  return [
    {
      name: free.label,
      priceLabel: priceLabel(currency, 0, 0),
      period: "forever",
      description: "Bring your own AI key and use everything, without limits.",
      features: [
        "Unlimited Smart Apply, resume tailoring & interview prep on your own AI key",
        "Works with Groq, Gemini, OpenAI, Claude or OpenRouter (Groq and Gemini keys are free)",
        `${free.matchPerRun} jobs scored per search; daily matching on your key`,
        "Adzuna + company career pages, all countries",
        "Application tracker and email digests",
        `No key yet? Try it with ${free.credits} hosted credits a month`,
      ],
      cta: "Get started",
      href: "/signup",
      featured: false,
    },
    {
      name: PLAN_CONFIG.pro.label,
      priceLabel: priceLabel(currency, PLAN_CONFIG.pro.priceUsd, PRICING.proInrPaise),
      period: "per month",
      description: "No key to manage. We run the AI for you.",
      features: [
        `${PLAN_CONFIG.pro.credits} hosted AI credits a month`,
        "Or use your own key and keep your credits",
        `${PLAN_CONFIG.pro.matchPerRun} jobs scored per search`,
        "New jobs scored for you every day, with email digests",
        `Up to ${fmt(PLAN_CONFIG.pro.maxVisibleMatches)} matches in your feed`,
      ],
      cta: "Upgrade to Pro",
      href: "/signup",
      featured: true,
    },
    {
      name: PLAN_CONFIG.premium.label,
      priceLabel: priceLabel(currency, PLAN_CONFIG.premium.priceUsd, PRICING.premiumInrPaise),
      period: "per month",
      description: "Hosted AI for a full-time search.",
      features: [
        `${PLAN_CONFIG.premium.credits} hosted AI credits a month`,
        "Or use your own key and keep your credits",
        `${PLAN_CONFIG.premium.matchPerRun} jobs scored per search`,
        `Up to ${fmt(PLAN_CONFIG.premium.maxVisibleMatches)} matches in your feed`,
        "Everything in Pro",
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
    .join(" · ") + " hosted credits · free with your own AI key"
