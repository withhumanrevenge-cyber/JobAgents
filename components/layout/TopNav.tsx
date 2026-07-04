"use client"

import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useDashboardStore } from "@/store/dashboardStore"
import { Loader2, RefreshCw, Check, AlertTriangle, Menu } from "lucide-react"
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
  const { syncing, setSyncing, triggerRefresh, toggleSidebar } = useDashboardStore()
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<"idle" | "fetching" | "scoring" | "done">("idle")
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [scoreLeft, setScoreLeft]   = useState<number | null>(null)

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
      for (let i = 0; i < 15; i++) {
        const matchRes = await fetch("/api/match", { method: "POST" })
        const matchData = await matchRes.json().catch(() => ({}))
        if (!matchRes.ok) {
          throw new Error(matchData.error || "Scoring failed.")
        }
        triggerRefresh()
        const remaining = Number(matchData.remaining ?? 0)
        setScoreLeft(remaining)
        if (remaining <= 0) break
      }
      setScoreLeft(null)
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
      setScoreLeft(null)
    }
  }

  const buttonLabel =
    syncStatus === "fetching" ? "Searching..." :
    syncStatus === "scoring"  ? (scoreLeft && scoreLeft > 0 ? `Matching... ${scoreLeft} left` : "Matching to your resume...") :
    syncStatus === "done"     ? "Done" :
    "Find new jobs"

  return (
    <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-gray-100 bg-white shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleSidebar}
          className="lg:hidden -ml-1 p-1.5 text-gray-500 hover:text-gray-900 rounded-md transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <p className="text-sm font-medium text-gray-900 truncate">{pageName}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <AnimatePresence>
          {syncError && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
              className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md max-w-[44vw] sm:max-w-[320px]"
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
              className="flex items-center gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-md max-w-[44vw] sm:max-w-none"
            >
              <Check className="w-3 h-3 shrink-0" />
              <span className="truncate">{syncSummary}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={handleSync}
          disabled={syncing}
          aria-label={buttonLabel}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 shrink-0 ${
            syncStatus === "done"
              ? "border-green-200 text-green-700 bg-green-50"
              : "border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900"
          }`}
        >
          {syncing          ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
           : syncStatus === "done" ? <Check className="w-3.5 h-3.5 shrink-0" />
           : <RefreshCw className="w-3.5 h-3.5 shrink-0" />}
          <span className="hidden sm:inline">{buttonLabel}</span>
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
