import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ArrowRight, Check, FileText, Sparkles, Target, MessagesSquare } from "lucide-react"
import { Reveal } from "@/components/motion/Reveal"
import { getPricingTiers, CREDIT_SUMMARY } from "@/lib/marketing/pricing"
import { detectCurrency } from "@/lib/marketing/geo"

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  if (code) redirect(`/api/auth/callback?code=${encodeURIComponent(code)}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect("/dashboard")

  const currency = await detectCurrency()
  const PRICING_TIERS = getPricingTiers(currency)

  const features = [
    { icon: FileText,      title: "Resume parser",    desc: "Your PDF is read and structured automatically. Skills, experience, target role — extracted in seconds." },
    { icon: Target,        title: "Job matching",     desc: "Every job across the web is scored 0–100 against your specific background, not just keyword-matched." },
    { icon: Sparkles,      title: "Resume tailoring", desc: "Each job gets a rewritten resume optimized for that exact description and ATS keywords." },
    { icon: MessagesSquare,title: "Interview prep",   desc: "10 role-specific questions with coaching tips generated before each interview." },
  ]

  const howItWorks = [
    { n: "01", title: "Upload resume",    desc: "Drop your PDF. Your career history is parsed instantly." },
    { n: "02", title: "Browse matches",   desc: "Jobs are fetched and scored. You see your fit percentage." },
    { n: "03", title: "Tailor and prep",  desc: "One click generates a tailored resume and cover letter — ready to submit on the original site." },
    { n: "04", title: "Interview ready",  desc: "Get a custom set of interview questions and coaching tips before the call." },
  ]

  return (
    <div className="relative min-h-screen flex flex-col selection:bg-accent/40 bg-background text-foreground overflow-x-hidden">
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/70 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">JobAgent</Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link href="/signup?as=recruiter" className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors">For employers</Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="bg-primary text-primary-foreground text-sm font-medium px-3.5 py-1.5 rounded-md hover:opacity-90 transition-opacity elev-1">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6">
        <section className="relative pt-20 md:pt-32 pb-24 md:pb-32 text-center">
          <Reveal>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em] mb-6">Job search automation</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tighter leading-[1.05] pb-2 max-w-4xl mx-auto text-gradient">
              Jobs that match<br className="hidden md:block" /> who you actually are.
            </h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="text-muted-foreground text-lg md:text-xl font-medium max-w-xl mx-auto leading-relaxed mt-8">
              Upload your resume once. Get scored matches, tailored resumes, AI cover letters, and interview prep — all in one place.
            </p>
          </Reveal>
          <Reveal delay={0.22}>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity elev-2">
                Start for free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login" className="border border-border text-foreground text-sm font-medium px-5 py-2.5 rounded-md hover:bg-accent transition-colors">
                Sign in
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-5">No credit card required</p>
          </Reveal>

          <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-10 -z-10 mx-auto max-w-3xl blur-[120px] opacity-40">
            <div className="aspect-square rounded-full bg-primary/10" />
          </div>
        </section>

        <section className="py-16 md:py-24 border-t border-border/60">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="spatial-card rounded-xl border border-border/60 bg-card p-6">
                <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-accent-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-2">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 md:py-24 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em] mb-12">How it works</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {howItWorks.map(({ n, title, desc }) => (
              <div key={n} className="flex flex-col gap-3">
                <span className="text-xs font-mono text-muted-foreground/70">{n}</span>
                <p className="text-base font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 md:py-24 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.2em] mb-12">Pricing</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div key={tier.name}
                className={`rounded-xl border p-6 flex flex-col spatial-card bg-card ${tier.featured ? "border-foreground" : "border-border/60"}`}>
                {tier.featured && (
                  <span className="self-start text-[10px] font-medium uppercase tracking-[0.15em] bg-primary text-primary-foreground px-2 py-0.5 rounded mb-3">Most popular</span>
                )}
                <p className="text-sm font-semibold text-foreground mb-1">{tier.name}</p>
                <p className="text-3xl font-semibold text-foreground mb-1 tracking-tight">
                  {tier.priceLabel}
                  {tier.period === "per month" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                </p>
                <p className="text-sm text-muted-foreground mb-6">{tier.period === "forever" ? "Forever" : "Cancel anytime"}</p>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                      <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tier.featured ? "text-foreground" : "text-muted-foreground"}`} />{f}
                    </li>
                  ))}
                </ul>
                <Link href={tier.href}
                  className={`block text-center text-sm font-medium py-2 rounded-md transition-colors ${
                    tier.featured ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border text-foreground hover:bg-accent"
                  }`}>
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6 text-center">{CREDIT_SUMMARY}</p>
          {currency === "INR" && (
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">Prices shown in ₹ for India · pay by UPI or card. International pricing in USD.</p>
          )}
        </section>
      </main>

      <footer className="border-t border-border/60 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <span className="text-sm font-semibold text-foreground">JobAgent</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <a href="mailto:withhumanrevenge@gmail.com" className="hover:text-foreground transition-colors">Contact</a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
