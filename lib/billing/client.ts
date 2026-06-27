// Client-side checkout launcher. Webhooks are the source of truth for entitlement —
// these calls just open the processor's checkout; the plan flips when the webhook fires.

type Provider = "razorpay" | "lemonsqueezy"
type PaidPlan = "pro" | "premium"

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as unknown as { Razorpay?: unknown }).Razorpay) return resolve()
    const s = document.createElement("script")
    s.src = "https://checkout.razorpay.com/v1/checkout.js"
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Failed to load Razorpay."))
    document.body.appendChild(s)
  })
}

export async function startCheckout(provider: Provider, plan: PaidPlan): Promise<void> {
  if (provider === "lemonsqueezy") {
    const res = await fetch("/api/billing/lemonsqueezy/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
    const data = await res.json()
    if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.")
    window.location.href = data.url
    return
  }

  // Razorpay
  const res = await fetch("/api/billing/razorpay/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Could not start checkout.")

  await loadRazorpay()
  const RZP = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay
  const options: Record<string, unknown> = {
    key: data.key_id,
    name: "JobAgent",
    description: plan === "pro" ? "JobAgent Pro" : "JobAgent Lifetime",
    theme: { color: "#111111" },
    handler: () => { window.location.href = "/settings?upgraded=1" },
  }
  if (data.type === "subscription") {
    options.subscription_id = data.subscription_id
  } else {
    options.order_id = data.order_id
    options.amount = data.amount
    options.currency = "INR"
  }
  new RZP(options).open()
}
