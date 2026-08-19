import Link from "next/link"
import { Check } from "lucide-react"
import { getPricingTiers, CREDIT_SUMMARY } from "@/lib/marketing/pricing"
import { detectCurrency } from "@/lib/marketing/geo"

export default async function PricingPage() {
  const currency = await detectCurrency()
  const PRICING_TIERS = getPricingTiers(currency)

  return (
    <div className="min-h-screen bg-card">
      <header className="border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-foreground">JobAgent</Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-md hover:opacity-90 transition-colors">Get started</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center mb-10 sm:mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Simple pricing</h1>
          <p className="text-lg text-muted-foreground mt-3">Start for free. Upgrade when you&apos;re ready.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PRICING_TIERS.map((plan) => (
            <div key={plan.name}
              className={`rounded-lg border p-6 sm:p-7 flex flex-col ${plan.featured ? "border-foreground bg-primary" : "border-border bg-card"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${plan.featured ? "text-muted-foreground" : "text-muted-foreground"}`}>{plan.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className={`text-4xl font-bold ${plan.featured ? "text-white" : "text-foreground"}`}>{plan.priceLabel}</span>
                <span className="text-sm mb-1.5 text-muted-foreground">/{plan.period}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? "text-muted-foreground" : "text-muted-foreground"}`}>{plan.description}</p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-white" : "text-muted-foreground"}`} />
                    <span className={`text-sm ${plan.featured ? "text-muted-foreground/60" : "text-foreground/80"}`}>{f}</span>
                  </li>
                ))}
              </ul>

              <Link href={plan.href}
                className={`text-center text-sm font-medium py-2.5 rounded-md transition-colors ${
                  plan.featured ? "bg-card text-foreground hover:bg-accent" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">{CREDIT_SUMMARY}</p>
        {currency === "INR" && (
          <p className="text-center text-[11px] text-muted-foreground mt-1.5">Prices shown in ₹ for India · pay by UPI or card. International pricing in USD.</p>
        )}

        <div className="max-w-3xl mx-auto mt-14 space-y-4">
          <p className="text-sm font-medium text-foreground/90">Frequently asked questions</p>
          {[
            { q: "How does job matching work?", a: "We parse your resume to extract skills and experience, then score each job 0–100 based on how well it matches your background." },
            { q: "Does JobAgent submit applications for me?", a: "No. We match jobs to your resume and prep the materials (tailored resume + cover letter), but you submit on the original site. The optional auto-mark setting only updates your tracker — it does not contact any employer." },
            { q: "Is my data stored securely?", a: "Yes. Your resume and profile data are stored securely via Supabase. We never sell your data." },
            { q: "Can I cancel anytime?", a: "Yes. No contracts or lock-ins. Downgrade to Free at any time." },
          ].map((item) => (
            <div key={item.q} className="border border-border rounded-md p-4">
              <p className="text-sm font-medium text-foreground mb-1">{item.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          No credit card required. Cancel anytime.{" "}
          <Link href="/login" className="text-foreground/80 underline underline-offset-2 hover:text-foreground">Already have an account?</Link>
        </p>
      </main>

      <footer className="border-t border-border/60 mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex justify-between items-center text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} JobAgent</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-foreground/90 transition-colors">Home</Link>
            <Link href="/privacy" className="hover:text-foreground/90 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground/90 transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-foreground/90 transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
