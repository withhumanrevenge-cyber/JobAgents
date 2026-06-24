import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ArrowRight, Check } from "lucide-react"
import { Reveal } from "@/components/motion/Reveal"

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // Safety net: if an OAuth provider lands the auth code on "/" (e.g. Supabase falling back to Site URL),
  // forward it to the callback route that actually exchanges it for a session.
  const { code } = await searchParams
  if (code) redirect(`/api/auth/callback?code=${encodeURIComponent(code)}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">JobAgent</span>
          <nav className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/login"   className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Sign in</Link>
            <Link href="/signup"  className="bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 rounded-md hover:bg-gray-700 transition-colors">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-5">Job search automation</p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="text-5xl font-semibold tracking-tight text-gray-900 leading-[1.1] mb-6">
            Find jobs that match<br />who you actually are
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-8">
            Upload your resume once. Get scored matches from across the web, tailored resumes, AI cover letters, and interview prep — all in one place.
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="flex items-center justify-center gap-3">
            <Link href="/signup" className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2">
              Start for free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="border border-gray-200 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-md hover:border-gray-400 transition-colors">
              Sign in
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">No credit card required</p>
        </Reveal>
      </section>

      <div className="border-t border-gray-100" />

      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { title: "Resume Parser",     desc: "Your PDF is read and structured automatically. Skills, experience, target role — extracted in seconds." },
            { title: "Job Matching",      desc: "Every job from Remotive, Adzuna, and JSearch is scored against your specific background." },
            { title: "Resume Tailoring",  desc: "Each job gets a rewritten resume optimized for that exact description and ATS keywords." },
            { title: "Interview Prep",    desc: "10 role-specific questions with coaching tips generated before each interview." },
          ].map(({ title, desc }) => (
            <div key={title}>
              <p className="text-sm font-semibold text-gray-900 mb-2">{title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-gray-100" />

      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-10">How it works</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { n: "1", title: "Upload resume",     desc: "Drop your PDF. Your career history is parsed instantly." },
            { n: "2", title: "Browse matches",    desc: "Jobs are fetched and scored. You see your fit percentage." },
            { n: "3", title: "Tailor and prep",   desc: "One click generates a tailored resume and cover letter — ready to submit on the original site." },
            { n: "4", title: "Interview ready",   desc: "Get a custom set of interview questions and coaching tips before the call." },
          ].map(({ n, title, desc }) => (
            <div key={n} className="flex gap-4">
              <span className="text-xs font-medium text-gray-300 mt-0.5 w-4 shrink-0">{n}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">{title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-gray-100" />

      <section className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-10">Pricing</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gray-200 rounded-lg p-6">
            <p className="text-sm font-semibold text-gray-900 mb-1">Free</p>
            <p className="text-3xl font-semibold text-gray-900 mb-1">$0</p>
            <p className="text-sm text-gray-400 mb-6">Forever</p>
            <ul className="space-y-2.5 mb-6">
              {["50 job matches / month", "3 resume tailors / month", "Remotive jobs", "Interview prep", "Application tracker"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <Check className="w-3.5 h-3.5 text-gray-400 shrink-0" />{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block text-center border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-md hover:border-gray-900 hover:text-gray-900 transition-colors">
              Get started
            </Link>
          </div>

          <div className="border border-gray-900 rounded-lg p-6">
            <p className="text-sm font-semibold text-gray-900 mb-1">Pro</p>
            <p className="text-3xl font-semibold text-gray-900 mb-1">$9<span className="text-base font-normal text-gray-400">/mo</span></p>
            <p className="text-sm text-gray-400 mb-6">Cancel anytime</p>
            <ul className="space-y-2.5 mb-6">
              {["Unlimited matches & tailoring", "All job sources (Adzuna + JSearch)", "ATS score optimization", "Export resume as PDF", "Email alerts for new matches", "Priority processing"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <Check className="w-3.5 h-3.5 text-gray-900 shrink-0" />{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block text-center bg-gray-900 text-white text-sm font-medium py-2 rounded-md hover:bg-gray-700 transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <div className="border-t border-gray-100" />

      <footer className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">JobAgent</span>
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} · <a href="mailto:withhumanrevenge@gmail.com" className="hover:text-gray-600 transition-colors">Contact</a></p>
      </footer>
    </div>
  )
}
