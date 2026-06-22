import Link from "next/link"
import { Check } from "lucide-react"

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to get started.",
    cta: "Get started",
    href: "/signup",
    featured: false,
    features: [
      "Up to 50 job matches/month",
      "Resume upload & parsing",
      "Match scoring",
      "Job filters & search",
      "Application tracker",
      "PDF resume download",
    ],
  },
  {
    name: "Pro",
    price: "$9",
    period: "per month",
    description: "For active job seekers who want every edge.",
    cta: "Upgrade to Pro",
    href: "mailto:withhumanrevenge@gmail.com?subject=JobAgent Pro",
    featured: true,
    features: [
      "Unlimited job matches",
      "Resume tailoring per job",
      "Interview question generation",
      "ATS score optimization",
      "All job sources (Remotive, Adzuna, JSearch)",
      "Auto-mark matched jobs in tracker",
      "Email notifications",
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">JobAgent</Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Sign in</Link>
            <Link href="/signup" className="bg-gray-900 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors">Get started</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Simple pricing</h1>
          <p className="text-lg text-gray-500 mt-3">Start for free. Upgrade when you&apos;re ready.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <div key={plan.name}
              className={`rounded-lg border p-7 flex flex-col ${plan.featured ? "border-gray-900 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${plan.featured ? "text-gray-400" : "text-gray-500"}`}>{plan.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className={`text-4xl font-bold ${plan.featured ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                <span className={`text-sm mb-1.5 ${plan.featured ? "text-gray-400" : "text-gray-400"}`}>/{plan.period}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? "text-gray-400" : "text-gray-500"}`}>{plan.description}</p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-white" : "text-gray-500"}`} />
                    <span className={`text-sm ${plan.featured ? "text-gray-300" : "text-gray-600"}`}>{f}</span>
                  </li>
                ))}
              </ul>

              <Link href={plan.href}
                className={`text-center text-sm font-medium py-2.5 rounded-md transition-colors ${
                  plan.featured ? "bg-white text-gray-900 hover:bg-gray-100" : "bg-gray-900 text-white hover:bg-gray-700"
                }`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-14 space-y-4">
          <p className="text-sm font-medium text-gray-700">Frequently asked questions</p>
          {[
            { q: "How does job matching work?", a: "We parse your resume to extract skills and experience, then score each job 0–100 based on how well it matches your background." },
            { q: "Does JobAgent submit applications for me?", a: "No. We match jobs to your resume and prep the materials (tailored resume + cover letter), but you submit on the original site. The optional auto-mark setting only updates your tracker — it does not contact any employer." },
            { q: "Is my data stored securely?", a: "Yes. Your resume and profile data are stored securely via Supabase. We never sell your data." },
            { q: "Can I cancel anytime?", a: "Yes. No contracts or lock-ins. Downgrade to Free at any time." },
          ].map((item) => (
            <div key={item.q} className="border border-gray-200 rounded-md p-4">
              <p className="text-sm font-medium text-gray-900 mb-1">{item.q}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-10">
          No credit card required. Cancel anytime.{" "}
          <Link href="/login" className="text-gray-600 underline underline-offset-2 hover:text-gray-900">Already have an account?</Link>
        </p>
      </main>

      <footer className="border-t border-gray-100 mt-20">
        <div className="max-w-5xl mx-auto px-6 py-6 flex justify-between items-center text-xs text-gray-400">
          <span>© {new Date().getFullYear()} JobAgent</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-gray-700 transition-colors">Home</Link>
            <Link href="/login" className="hover:text-gray-700 transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-gray-700 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
