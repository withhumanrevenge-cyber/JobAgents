import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft } from "lucide-react"

export default async function HireLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, onboarded")
    .eq("user_id", user.id)
    .single()
  if (!profile?.onboarded) redirect("/onboarding?as=recruiter")
  if (profile.account_type !== "recruiter") redirect("/dashboard")

  return (
    <div className="min-h-screen bg-muted font-sans">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/hire" className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">JobAgent</span>
            <span className="text-[10px] font-medium uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">Hiring</span>
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Job seeker view
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  )
}
