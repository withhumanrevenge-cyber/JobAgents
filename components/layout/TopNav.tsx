"use client"

import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useDashboardStore } from "@/store/dashboardStore"
import { Loader2, RefreshCw, Check, AlertTriangle } from "lucide-react"
import { spring } from "@/lib/motion"

const PAGE_NAMES: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/jobs":         "Jobs",
  "/applications": "Applications",
  "/settings":     "Settings",
}

export function TopNav() {
  const pathname = usePathname()
  const supabase  = useMemo(() => createClient(), [])
  const { syncing, setSyncing, triggerRefresh } = useDashboardStore()
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<"idle" | "fetching" | "scoring" | "done">("idle")
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email || null)
    })
  }, [supabase])

  const pageName = Object.entries(PAGE_NAMES).find(([k]) => pathname.startsWith(k))?.[1] ?? "JobAgent"

  const handleSync = async () => {
    if (syncing) return
    setSyncStatus("fetching")
    setSyncError(null)
    setSyncSummary(null)
    setSyncing(true)
    try {
      const fetchRes = await fetch("/api/jobs/fetch", { method: "POST" })
      const fetchData = await fetchRes.json().catch(() => ({}))
      if (!fetchRes.ok) {
        throw new Error(fetchData.error || "Failed to fetch jobs.")
      }
      setSyncStatus("scoring")
      const matchRes = await fetch("/api/match", { method: "POST" })
      if (!matchRes.ok) {
        const data = await matchRes.json().catch(() => ({}))
        throw new Error(data.error || "Scoring failed.")
      }
      triggerRefresh()
      setSyncStatus("done")
      const cc = fetchData.country || "US"
      const summary = `${fetchData.new ?? 0} new jobs from ${cc}`
      setSyncSummary(summary)
      setTimeout(() => { setSyncStatus("idle"); setSyncSummary(null) }, 6000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Job search failed. Please try again."
      setSyncError(msg)
      setSyncStatus("idle")
      setTimeout(() => setSyncError(null), 8000)
    } finally {
      setSyncing(false)
    }
  }

  const buttonLabel =
    syncStatus === "fetching" ? "Searching..." :
    syncStatus === "scoring"  ? "Matching to your resume..." :
    syncStatus === "done"     ? "Done" :
    "Find new jobs"

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-gray-100 bg-white shrink-0">
      <p className="text-sm font-medium text-gray-900">{pageName}</p>

      <div className="flex items-center gap-3">
        <AnimatePresence>
          {syncError && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
              className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md max-w-[320px]"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">{syncError}</span>
            </motion.div>
          )}
          {syncSummary && !syncError && (
            <motion.div
              key="sum"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
              className="flex items-center gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-md"
            >
              <Check className="w-3 h-3 shrink-0" />
              <span>{syncSummary}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
            syncStatus === "done"
              ? "border-green-200 text-green-700 bg-green-50"
              : "border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900"
          }`}
        >
          {syncing          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
           : syncStatus === "done" ? <Check className="w-3.5 h-3.5" />
           : <RefreshCw className="w-3.5 h-3.5" />}
          {buttonLabel}
        </button>

        {userEmail && (
          <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
            <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 select-none">
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[140px]">{userEmail}</span>
          </div>
        )}
      </div>
    </header>
  )
}
