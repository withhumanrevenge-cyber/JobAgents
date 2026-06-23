"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Check, Zap, CreditCard } from "lucide-react"
import { startCheckout } from "@/lib/billing/client"
import { PRICING } from "@/lib/billing/config"
import type { Plan } from "@/types"

interface UsageData {
  plan: Plan
  limits: { smart_apply: number | null; tailor: number | null; interview: number | null }
  used: { smart_apply: number; tailor: number; interview: number }
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

  const pay = async (provider: "razorpay" | "lemonsqueezy", plan: "pro" | "lifetime") => {
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

  const isPaid = data.plan !== "free"

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {justUpgraded && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Payment received. If your plan still shows Free, give it a moment — it updates when the payment is confirmed.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Plan & usage</p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
          data.plan === "free" ? "bg-gray-100 text-gray-600" :
          data.plan === "pro" ? "bg-blue-50 text-blue-700 border border-blue-200" :
          "bg-amber-50 text-amber-700 border border-amber-200"
        }`}>{data.plan}</span>
      </div>

      {!isPaid && (
        <div className="space-y-2">
          <UsageBar label="Smart Applies" used={data.used.smart_apply} limit={data.limits.smart_apply} />
          <UsageBar label="Resume tailors" used={data.used.tailor} limit={data.limits.tailor} />
          <UsageBar label="Interview preps" used={data.used.interview} limit={data.limits.interview} />
        </div>
      )}

      {isPaid ? (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Unlimited Smart Apply, tailoring, and interview prep.
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-xs font-medium text-gray-700">Upgrade for unlimited</p>

          <PlanOption
            title="Pro"
            price={`$${PRICING.proMonthlyUsd}/mo`}
            inr={`or ₹${(PRICING.proMonthlyInrPaise / 100).toLocaleString()}/mo`}
            busy={busy}
            onIntl={() => pay("lemonsqueezy", "pro")}
            onIndia={() => pay("razorpay", "pro")}
            keyPrefix="pro"
          />
          <PlanOption
            title="Lifetime"
            price={`$${PRICING.lifetimeUsd} once`}
            inr={`or ₹${(PRICING.lifetimeInrPaise / 100).toLocaleString()} once`}
            busy={busy}
            onIntl={() => pay("lemonsqueezy", "lifetime")}
            onIndia={() => pay("razorpay", "lifetime")}
            keyPrefix="lifetime"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null
  const pct = !unlimited && limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const atLimit = !unlimited && used >= limit
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={atLimit ? "text-red-600 font-medium" : "text-gray-400"}>{used}/{unlimited ? "∞" : limit}</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${atLimit ? "bg-red-400" : "bg-gray-900"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PlanOption({ title, price, inr, busy, onIntl, onIndia, keyPrefix }: {
  title: string; price: string; inr: string; busy: string | null
  onIntl: () => void; onIndia: () => void; keyPrefix: string
}) {
  return (
    <div className="border border-gray-200 rounded-md p-3">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{price}</p>
          <p className="text-[10px] text-gray-400">{inr}</p>
        </div>
      </div>
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
