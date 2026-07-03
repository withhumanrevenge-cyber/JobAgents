"use client"

import { useEffect, useState, Suspense } from "react"
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}>
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

  useEffect(() => {
    if (matches.length > 0 || allJobRows.length > 0) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      const inFeed = (m: (typeof matches)[number]) =>
        m.job?.posted_date ? new Date(m.job.posted_date).getTime() >= cutoff : false
      Promise.resolve().then(() =>
        setStats({
          totalJobs:        allJobRows.filter(inFeed).length,
          matches:          matches.filter((m) => m.status === "reviewed" && inFeed(m)).length,
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
      const fetchRes = await fetch("/api/jobs/fetch", { method: "POST" })
      if (!fetchRes.ok) {
        const d = await fetchRes.json().catch(() => ({}))
        throw new Error(d.error || "Failed to fetch jobs.")
      }
      const matchRes = await fetch("/api/match", { method: "POST" })
      if (!matchRes.ok) {
        const d = await matchRes.json().catch(() => ({}))
        throw new Error(d.error || "Scoring failed.")
      }
      triggerRefresh()
    } catch (err: unknown) {
      setInlineSyncError(err instanceof Error ? err.message : "Job search failed.")
    } finally {
      setInlineSyncing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  const threshold = profile?.match_threshold || 70
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const topMatches = [...matches]
    .filter((m) => m.match_score >= threshold && m.status !== "skipped"
      && (m.job?.posted_date ? new Date(m.job.posted_date).getTime() >= monthAgo : false))
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
            <p className="text-sm font-medium text-blue-900">Welcome aboard — searching for your first matches</p>
            <p className="text-xs text-blue-700 mt-0.5">Jobs are being fetched and scored against your resume right now. Refresh in 30-60 seconds.</p>
          </div>
        </div>
      )}

      <Reveal>
        <h1 className="text-lg font-semibold text-gray-900">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Here&apos;s your job search overview.</p>
      </Reveal>

      <Reveal delay={0.05}>
        <StatsBar stats={stats} />
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-2">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-400">Top matches</p>
            <Link href="/jobs" className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
              All jobs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {topMatches.length === 0 ? (
              <div className="text-center py-12 px-6">
                <p className="text-sm text-gray-500">No matches yet</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  {profile?.parsed_resume
                    ? "Fetch fresh jobs and score them against your resume."
                    : "Upload your resume first, then search for jobs."}
                </p>
                {profile?.parsed_resume && (
                  <button onClick={runInlineSync} disabled={inlineSyncing}
                    className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-2 transition-colors">
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
                    <div className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{match.job?.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{match.job?.company} · {match.job?.location || "Remote"}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <MatchScoreBadge score={match.match_score} size="sm" />
                        <Link href={`/jobs/${match.job?.id}`}
                          className="w-7 h-7 border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:border-gray-900 hover:text-gray-900 transition-colors">
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
