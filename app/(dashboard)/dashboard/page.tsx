"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useJobs } from "@/hooks/useJobs"
import { useProfile } from "@/hooks/useProfile"
import { useDashboardStore } from "@/store/dashboardStore"
import { StatsBar } from "@/components/dashboard/StatsBar"
import { ActivityFeed } from "@/components/dashboard/ActivityFeed"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { Loader2, ArrowRight, FileText, RefreshCw, Sparkles } from "lucide-react"
import Link from "next/link"
import { Reveal } from "@/components/motion/Reveal"
import { Stagger, StaggerItem } from "@/components/motion/Stagger"
import { apiFetch } from "@/lib/api"
import { scoreNewJobs } from "@/lib/scoreJobs"
import { useAISettings } from "@/hooks/useAISettings"
import { PLAN_CONFIG } from "@/lib/plans"
import { KeyRound } from "lucide-react"

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
      <DashboardHome />
    </Suspense>
  )
}

function DashboardHome() {
  const { profile, loading: profileLoading } = useProfile()
  const { allJobRows, matches, loading: jobsLoading } = useJobs()
  const { triggerRefresh } = useDashboardStore()
  const searchParams = useSearchParams()
  const justOnboarded = searchParams.get("just_onboarded") === "1"
  const [stats, setStats] = useState({ totalJobs: 0, matches: 0, applicationsSent: 0, interviews: 0 })
  const [inlineSyncing, setInlineSyncing] = useState(false)
  const [inlineSyncError, setInlineSyncError] = useState<string | null>(null)
  const { settings: ai } = useAISettings()
  const autoRan = useRef(false)

  useEffect(() => {
    if (matches.length > 0 || allJobRows.length > 0) {
      // Every job scored against the user's resume, matched or below their threshold.
      const scored = (m: (typeof matches)[number]) => m.match_score >= 0
      Promise.resolve().then(() =>
        setStats({
          totalJobs:        allJobRows.filter(scored).length,
          matches:          matches.filter((m) => m.status === "reviewed" || m.status === "pending").length,
          applicationsSent: matches.filter((m) => m.status === "applied").length,
          interviews:       matches.filter((m) => m.status === "interview").length,
        })
      )
    }
  }, [matches, allJobRows, profile])

  const isLoading = profileLoading || jobsLoading
  const needsResume = !profileLoading && profile && !profile.parsed_resume

  const runInlineSync = async () => {
    setInlineSyncing(true)
    setInlineSyncError(null)
    try {
      const fetchRes = await apiFetch("/api/jobs/fetch", { method: "POST" })
      if (!fetchRes.ok) {
        const d = await fetchRes.json().catch(() => ({}))
        throw new Error(d.error || "Failed to fetch jobs.")
      }
      const run = await scoreNewJobs(() => triggerRefresh())
      if (run.limited) setInlineSyncError("Free trial limit reached for now. Add your own AI key in Settings to score more jobs.")
    } catch (err: unknown) {
      setInlineSyncError(err instanceof Error ? err.message : "Job search failed.")
    } finally {
      setInlineSyncing(false)
    }
  }

  // Straight after onboarding, run the first search here (with progress) rather than asking the
  // user to refresh and hope background work has finished.
  useEffect(() => {
    if (!justOnboarded || autoRan.current || isLoading || !profile?.parsed_resume || matches.length > 0) return
    autoRan.current = true
    runInlineSync()
  }, [justOnboarded, isLoading, profile, matches.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const threshold = profile?.match_threshold ?? 70
  const topMatches = [...matches]
    .filter((m) => m.match_score >= threshold && m.status !== "skipped" && m.job)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-6">

      {needsResume && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <FileText className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">Upload your resume to start matching</p>
            <p className="text-xs text-amber-700 mt-0.5">Without a parsed resume, the AI can&apos;t score jobs against your background.</p>
          </div>
          <Link href="/settings" className="bg-amber-900 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors shrink-0">
            Upload now
          </Link>
        </div>
      )}

      {justOnboarded && matches.length === 0 && !needsResume && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Welcome aboard. Finding your first matches</p>
            <p className="text-xs text-blue-700 mt-0.5">{inlineSyncing ? "Fetching jobs and scoring them against your resume. This takes about a minute; matches appear below as they're scored." : "Use “Find jobs now” below if nothing has appeared yet."}</p>
          </div>
        </div>
      )}

      {!needsResume && ai?.mode === "trial" && (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <KeyRound className="w-4 h-4 text-foreground/70 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Use JobAgent free, without limits</p>
            <p className="text-xs text-muted-foreground mt-0.5">You&apos;re on the trial: {PLAN_CONFIG.free.credits} AI credits a month and {PLAN_CONFIG.free.trialMatchPerRun} jobs scored per search. Add your own AI key (Groq and Gemini keys are free) and everything is unlimited.</p>
          </div>
          <Link href="/settings#ai" className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md hover:opacity-90 transition-colors shrink-0">
            Add AI key
          </Link>
        </div>
      )}

      <Reveal>
        <h1 className="text-lg font-semibold text-foreground">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s your job search overview.</p>
      </Reveal>

      <Reveal delay={0.05}>
        <StatsBar stats={stats} />
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-2">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-muted-foreground">Top matches</p>
            <Link href="/jobs" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All jobs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-card border border-border rounded-lg divide-y divide-gray-100">
            {topMatches.length === 0 ? (
              <div className="text-center py-12 px-6">
                <p className="text-sm text-muted-foreground">No matches yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  {profile?.parsed_resume
                    ? "Fetch fresh jobs and score them against your resume."
                    : "Upload your resume first, then search for jobs."}
                </p>
                {profile?.parsed_resume && (
                  <button onClick={runInlineSync} disabled={inlineSyncing}
                    className="bg-primary text-primary-foreground text-xs font-medium px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2 transition-colors">
                    {inlineSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {inlineSyncing ? "Searching..." : "Find jobs now"}
                  </button>
                )}
                {inlineSyncError && (
                  <p className="text-xs text-red-600 mt-3">{inlineSyncError}</p>
                )}
              </div>
            ) : (
              <Stagger>
                {topMatches.map((match) => (
                  <StaggerItem key={match.id}>
                    <div className="p-4 flex items-center justify-between gap-4 hover:bg-muted transition-colors group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{match.job?.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{match.job?.company} · {match.job?.location || "Remote"}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <MatchScoreBadge score={match.match_score} size="sm" />
                        <Link href={`/jobs/${match.job?.id}`}
                          className="w-7 h-7 border border-border rounded-md flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>

        <ActivityFeed recentMatches={matches} />
      </div>
    </div>
  )
}
