import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useDashboardStore } from "@/store/dashboardStore"
import { Match } from "@/types"

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

      // Only real matches — rows the matching agent has actually evaluated against your resume.
      // No client-side synthetic "pending" rows for unscored jobs; that fabricated data is the source of count mismatches.
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(`*, job:jobs(*)`)
        .eq("user_id", user.id)

      if (matchesError) throw matchesError

      setMatches(matchesData || [])
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
    // allJobRows is preserved as an alias for backward-compatibility with existing consumers.
    // Both point at the same array — real, AI-evaluated matches only.
    allJobRows: matches,
    loading,
    error,
    refresh: () => fetchJobsAndMatches(false),
  }
}
