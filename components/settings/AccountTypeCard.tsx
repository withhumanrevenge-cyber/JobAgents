"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Building2, Briefcase } from "lucide-react"

export function AccountTypeCard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [accountType, setAccountType] = useState<"seeker" | "recruiter" | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [switching, setSwitching] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("profiles").select("account_type, company_name").eq("user_id", user.id).single()
        .then(({ data }) => {
          setAccountType(data?.account_type === "recruiter" ? "recruiter" : "seeker")
          setCompanyName(data?.company_name || "")
        })
    })
  }, [supabase])

  const becomeRecruiter = async () => {
    if (!companyName.trim()) { setError("Company name is required."); return }
    setSwitching(true); setError(null)
    try {
      const res = await fetch("/api/hire/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName.trim() }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to switch.") }
      router.push("/hire")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to switch.")
      setSwitching(false)
    }
  }

  const becomeSeeker = async () => {
    setSwitching(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from("profiles").update({ account_type: "seeker" }).eq("user_id", user.id)
    setAccountType("seeker")
    setSwitching(false)
    router.refresh()
  }

  if (!accountType) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900">Account type</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {accountType === "recruiter"
            ? <>Hiring as <span className="font-medium text-gray-600">{companyName || "your company"}</span>.</>
            : "You're set up as a job seeker."}
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {accountType === "recruiter" ? (
        <button onClick={becomeSeeker} disabled={switching}
          className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-medium py-2 rounded-md hover:border-gray-400 disabled:opacity-50 transition-colors">
          {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />}
          Switch to job seeking
        </button>
      ) : showForm ? (
        <div className="space-y-2">
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name"
            className="w-full border border-gray-200 rounded-md py-2 px-3 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-xs font-medium py-2 rounded-md hover:border-gray-400 transition-colors">Cancel</button>
            <button onClick={becomeRecruiter} disabled={switching}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gray-900 text-white text-xs font-medium py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {switching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Start hiring
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-medium py-2 rounded-md hover:border-gray-400 transition-colors">
          <Building2 className="w-3.5 h-3.5" />
          Hiring? Switch to a recruiter account
        </button>
      )}
    </div>
  )
}
