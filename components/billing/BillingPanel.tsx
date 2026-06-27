"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Check, CreditCard, Zap } from "lucide-react"
import { startCheckout } from "@/lib/billing/client"
import { PLAN_CONFIG, ACTION_LABEL } from "@/lib/plans"
import type { Plan, UsageAction } from "@/types"

interface UsageData {
  plan: Plan
  credits: { allotment: number; used: number; remaining: number }
  costs: Record<UsageAction, number>
  maxVisibleMatches: number
}

const PLAN_TONE: Record<Plan, string> = {
  free: "bg-gray-100 text-gray-600",
  pro: "bg-blue-50 text-blue-700 border border-blue-200",
  premium: "bg-amber-50 text-amber-700 border border-amber-200",
}

export function BillingPanel() {
  const searchParams = useSearchParams()
  const justUpgraded = searchParams.get("upgraded") === "1"
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/usage/me").then((r) => r.json()).then((d) => {
      if (!d.error) setData(d)
    }).finally(() => setLoading(false))
  }, [])

  const pay = async (provider: "razorpay" | "lemonsqueezy", plan: "pro" | "premium") => {
    setBusy(`${provider}-${plan}`); setError(null)
    try {
      await startCheckout(provider, plan)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Checkout failed.")
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="bg-white border border-gray-200 rounded-lg p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
  }
  if (!data) return null

  const { allotment, used, remaining } = data.credits
  const pct = allotment > 0 ? Math.min(100, (used / allotment) * 100) : 0
  const low = remaining <= Math.max(2, allotment * 0.15)
  // Which tiers to offer as upgrades (anything above the current one).
  const upgrades = (["pro", "premium"] as const).filter((p) => PLAN_CONFIG[p].priceUsd > PLAN_CONFIG[data.plan].priceUsd)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {justUpgraded && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Payment received. If your plan still shows the old tier, give it a moment to confirm.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Plan & credits</p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${PLAN_TONE[data.plan]}`}>{data.plan}</span>
      </div>

      {/* Credit balance */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-gray-500">Credits this month</span>
          <span className={low ? "text-red-600 font-medium" : "text-gray-400"}>{remaining} / {allotment} left</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${low ? "bg-red-400" : "bg-gray-900"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          {(Object.keys(data.costs) as UsageAction[]).map((a) => `${ACTION_LABEL[a]} ${data.costs[a]}`).join(" · ")} credits · matching is free
        </p>
      </div>

      {upgrades.length === 0 ? (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> You&apos;re on the top tier — {allotment} credits/month.
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-xs font-medium text-gray-700">Upgrade for more credits & jobs</p>
          {upgrades.map((p) => (
            <PlanOption
              key={p}
              title={PLAN_CONFIG[p].label}
              price={`$${PLAN_CONFIG[p].priceUsd}/mo`}
              detail={`${PLAN_CONFIG[p].credits} credits · ${PLAN_CONFIG[p].maxVisibleMatches.toLocaleString()} job matches`}
              busy={busy}
              onIntl={() => pay("lemonsqueezy", p)}
              onIndia={() => pay("razorpay", p)}
              keyPrefix={p}
            />
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function PlanOption({ title, price, detail, busy, onIntl, onIndia, keyPrefix }: {
  title: string; price: string; detail: string; busy: string | null
  onIntl: () => void; onIndia: () => void; keyPrefix: string
}) {
  return (
    <div className="border border-gray-200 rounded-md p-3">
      <div className="flex items-baseline justify-between mb-0.5">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm font-medium text-gray-900">{price}</p>
      </div>
      <p className="text-[10px] text-gray-400 mb-2">{detail}</p>
      <div className="flex gap-2">
        <button onClick={onIntl} disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-1.5 bg-gray-900 text-white text-xs font-medium py-1.5 rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {busy === `lemonsqueezy-${keyPrefix}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
          Card
        </button>
        <button onClick={onIndia} disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-medium py-1.5 rounded-md hover:border-gray-400 disabled:opacity-50 transition-colors">
          {busy === `razorpay-${keyPrefix}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          UPI / India
        </button>
      </div>
    </div>
  )
}
