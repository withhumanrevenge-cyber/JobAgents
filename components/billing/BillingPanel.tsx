"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Check, CreditCard, Zap } from "lucide-react"
import { startCheckout } from "@/lib/billing/client"
import { PLAN_CONFIG, ACTION_LABEL } from "@/lib/plans"
import type { Plan, UsageAction } from "@/types"
import { apiFetch } from "@/lib/api"

interface UsageData {
  plan: Plan
  // byok: the user's own AI key (no credits spent). hosted / trial: JobAgent's AI on credits.
  ai_mode: "byok" | "hosted" | "trial"
  credits: { allotment: number; used: number; remaining: number }
  costs: Record<UsageAction, number>
  maxVisibleMatches: number
  prices: { pro: string; premium: string }
  processors: { razorpay: boolean; lemonsqueezy: boolean }
}

const PLAN_TONE: Record<Plan, string> = {
  free: "bg-accent text-foreground/80",
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
    const currency = document.cookie.match(/(?:^|; )ja_currency=(INR|USD)/)?.[1] ?? "USD"
    apiFetch(`/api/usage/me?currency=${currency}`).then((r) => r.json()).then((d) => {
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
    return <div className="bg-card border border-border rounded-lg p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  }
  if (!data) return null

  const { allotment, used, remaining } = data.credits
  const pct = allotment > 0 ? Math.min(100, (used / allotment) * 100) : 0
  const low = remaining <= Math.max(2, allotment * 0.15)
  const upgrades = (["pro", "premium"] as const).filter((p) => PLAN_CONFIG[p].priceUsd > PLAN_CONFIG[data.plan].priceUsd)

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      {justUpgraded && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Payment received. If your plan still shows the old tier, give it a moment to confirm.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Plan</p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${PLAN_TONE[data.plan]}`}>{data.plan}</span>
      </div>

      {data.ai_mode === "byok" && (
        <p className="text-xs text-foreground/90 bg-muted border border-border rounded-md px-3 py-2">
          AI runs on your own key, so Smart Apply, tailoring and interview prep use no credits.
          {data.plan !== "free" && " Your hosted credits below stay available if you switch back."}
        </p>
      )}

      {(data.ai_mode !== "byok" || data.plan !== "free") && (
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-muted-foreground">{data.ai_mode === "trial" ? "Free trial credits this month" : "Hosted AI credits this month"}</span>
          <span className={low ? "text-red-600 font-medium" : "text-muted-foreground"}>{remaining} / {allotment} left</span>
        </div>
        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${low ? "bg-red-400" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {(Object.keys(data.costs) as UsageAction[]).map((a) => `${ACTION_LABEL[a]} ${data.costs[a]}`).join(" · ")} credits · matching is free
        </p>
      </div>
      )}

      {upgrades.length === 0 ? (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> You&apos;re on the top tier: {allotment} hosted AI credits a month.
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-xs font-medium text-foreground/90">Upgrade for hosted AI: no key needed</p>
          {upgrades.map((p) => (
            <PlanOption
              key={p}
              title={PLAN_CONFIG[p].label}
              price={`${data.prices[p]}/mo`}
              detail={`${PLAN_CONFIG[p].credits} hosted AI credits a month · daily matching and email digests without a key · ${PLAN_CONFIG[p].maxVisibleMatches.toLocaleString()} matches in your feed`}
              busy={busy}
              processors={data.processors}
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

function PlanOption({ title, price, detail, busy, processors, onIntl, onIndia, keyPrefix }: {
  title: string; price: string; detail: string; busy: string | null
  processors: { razorpay: boolean; lemonsqueezy: boolean }
  onIntl: () => void; onIndia: () => void; keyPrefix: string
}) {
  const both = processors.razorpay && processors.lemonsqueezy
  const none = !processors.razorpay && !processors.lemonsqueezy
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-baseline justify-between mb-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm font-medium text-foreground">{price}</p>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">{detail}</p>
      {none ? (
        <p className="text-[10px] text-muted-foreground">Checkout coming soon.</p>
      ) : (
        <div className="flex gap-2">
          {processors.lemonsqueezy && (
            <button onClick={onIntl} disabled={!!busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-colors">
              {busy === `lemonsqueezy-${keyPrefix}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
              {both ? "Card" : "Upgrade"}
            </button>
          )}
          {processors.razorpay && (
            <button onClick={onIndia} disabled={!!busy}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md disabled:opacity-50 transition-colors ${both ? "border border-border text-foreground/90 hover:border-foreground/40" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {busy === `razorpay-${keyPrefix}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {both ? "UPI / India" : "Upgrade"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
