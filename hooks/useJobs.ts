import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useDashboardStore } from "@/store/dashboardStore"
import { Match } from "@/types"

// Select every job column the UI touches — avoids `*` payload bloat
// (job.description alone can be several KB per row).
const JOB_COLUMNS = "id, title, company, location, country, region, remote, job_type, experience_level, url, description, salary_range, tags, posted_date, source, source_id, created_at"

// Cap each half so we never hit Supabase's 1000-row default.
const ACTIVE_LIMIT = 500
const SKIPPED_LIMIT = 500

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

      // Fetch non-skipped (reviewed/pending/applied/interview/offer/rejected) and
      // skipped in parallel with independent caps, so a big pile of skipped rows
      // never squeezes out actual matches through the 1000-row default limit.
      const [activeRes, skippedRes] = await Promise.all([
        supabase
          .from("matches")
          .select(`*, job:jobs(${JOB_COLUMNS})`)
          .eq("user_id", user.id)
          .neq("status", "skipped")
          .order("match_score", { ascending: false })
          .limit(ACTIVE_LIMIT),
        supabase
          .from("matches")
          .select(`*, job:jobs(${JOB_COLUMNS})`)
          .eq("user_id", user.id)
          .eq("status", "skipped")
          .order("match_score", { ascending: false })
          .limit(SKIPPED_LIMIT),
      ])

      if (activeRes.error) throw activeRes.error
      if (skippedRes.error) throw skippedRes.error

      setMatches([...(activeRes.data || []), ...(skippedRes.data || [])])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jobs data.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchJobsAndMatches(true)
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
