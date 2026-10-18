import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useDashboardStore } from "@/store/dashboardStore"
import { JobStatus, Match } from "@/types"
import { JOB_MAX_AGE_DAYS } from "@/lib/plans"
import { effectiveStatus } from "@/lib/status"

// Select every job column the UI touches — avoids `*` payload bloat
// (job.description alone can be several KB per row).
const JOB_COLUMNS = "id, title, company, location, country, region, remote, job_type, experience_level, url, description, salary_range, tags, posted_date, source, source_id, created_at"

// Cap each query so we never hit Supabase's 1000-row default.
const ACTIVE_LIMIT = 500
const TRACKED_LIMIT = 500
const SKIPPED_LIMIT = 500

const OPEN_STATUSES: JobStatus[] = ["pending", "reviewed"]
const TRACKED_STATUSES: JobStatus[] = ["applied", "interview", "offer", "rejected"]

export function useJobs() {
  const supabase = useMemo(() => createClient(), [])
  const { refreshKey } = useDashboardStore()
  const isMounted = useRef(false)

  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobsAndMatches = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("User not authenticated.")
        setLoading(false)
        return
      }

      // Three queries with independent caps, so a big pile of skipped rows never squeezes out
      // actual matches through the 1000-row default limit:
      //  - open matches (pending/reviewed) and skipped ones, only for jobs posted within
      //    JOB_MAX_AGE_DAYS: older roles have usually closed;
      //  - tracked applications (applied/interview/offer/rejected) at any age, so a job the
      //    user applied to never disappears from their pipeline or the dashboard counts.
      const cutoff = new Date(Date.now() - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const [profileRes, openRes, trackedRes, skippedRes] = await Promise.all([
        supabase.from("profiles").select("match_threshold").eq("user_id", user.id).single(),
        supabase
          .from("matches")
          .select(`*, job:jobs!inner(${JOB_COLUMNS})`)
          .eq("user_id", user.id)
          .in("status", OPEN_STATUSES)
          .gte("job.posted_date", cutoff)
          .order("match_score", { ascending: false })
          .limit(ACTIVE_LIMIT),
        supabase
          .from("matches")
          .select(`*, job:jobs(${JOB_COLUMNS})`)
          .eq("user_id", user.id)
          .in("status", TRACKED_STATUSES)
          .order("match_score", { ascending: false })
          .limit(TRACKED_LIMIT),
        supabase
          .from("matches")
          .select(`*, job:jobs!inner(${JOB_COLUMNS})`)
          .eq("user_id", user.id)
          .eq("status", "skipped")
          .gte("job.posted_date", cutoff)
          .order("match_score", { ascending: false })
          .limit(SKIPPED_LIMIT),
      ])

      if (openRes.error) throw openRes.error
      if (trackedRes.error) throw trackedRes.error
      if (skippedRes.error) throw skippedRes.error

      // Re-sort matched vs below threshold by the current threshold (see effectiveStatus).
      const threshold = profileRes.data?.match_threshold ?? 70
      const rows: Match[] = [...(openRes.data || []), ...(trackedRes.data || []), ...(skippedRes.data || [])]
      setMatches(rows.map((m) => ({ ...m, status: effectiveStatus(m.status, m.match_score, threshold) })))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jobs data.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void Promise.resolve().then(() => fetchJobsAndMatches(true))
  }, [fetchJobsAndMatches])

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    fetchJobsAndMatches(false)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    matches,
    allJobRows: matches,
    loading,
    error,
    refresh: () => fetchJobsAndMatches(false),
  }
}
