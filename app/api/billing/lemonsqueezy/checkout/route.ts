import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { lemonVariantForPlan } from "@/lib/billing/config"
import { Plan } from "@/types"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { plan } = await request.json() as { plan: Plan }
    const variantId = lemonVariantForPlan(plan)
    const apiKey = process.env.LEMONSQUEEZY_API_KEY
    const storeId = process.env.LEMONSQUEEZY_STORE_ID

    if (!apiKey || !storeId || !variantId) {
      return NextResponse.json({ error: "Lemon Squeezy is not configured." }, { status: 503 })
    }

    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: user.email,
              custom: { user_id: user.id, plan },
            },
            product_options: { redirect_url: `${APP_URL}/settings?upgraded=1` },
          },
          relationships: {
            store: { data: { type: "stores", id: String(storeId) } },
            variant: { data: { type: "variants", id: String(variantId) } },
          },
        },
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      console.error("Lemon Squeezy checkout error:", JSON.stringify(json).slice(0, 300))
      return NextResponse.json({ error: "Could not start checkout." }, { status: 502 })
    }

    return NextResponse.json({ url: json.data?.attributes?.url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Checkout failed."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
