import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Match, JobStatus } from "@/types"

export function useApplications() {
  const supabase = useMemo(() => createClient(), [])
  const [applications, setApplications] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchApplications = useCallback(async (isInitial = false) => {
    try {
      if (!isInitial) {
        setLoading(true)
      }
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("User not authenticated.")
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from("matches")
        .select(`
          *,
          job:jobs(*)
        `)
        .eq("user_id", user.id)
        .in("status", ["applied", "interview", "offer", "rejected"])
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError

      setApplications(data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load applications.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchApplications(true)
    })
  }, [fetchApplications])

  const updateApplicationStatus = async (matchId: string, status: JobStatus) => {
    try {
      setUpdating(true)
      
      const updateData: { status: JobStatus; applied_at?: string } = { status }
      if (status === "applied") {
        updateData.applied_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from("matches")
        .update(updateData)
        .eq("id", matchId)

      if (updateError) throw updateError

      await fetchApplications()
      return { success: true }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to update status."
      setError(errMsg)
      return { success: false, error: err }
    } finally {
      setUpdating(false)
    }
  }

  const saveApplicationNotes = async (matchId: string, notes: string) => {
    try {
      setUpdating(true)

      const { error: updateError } = await supabase
        .from("matches")
        .update({ notes })
        .eq("id", matchId)

      if (updateError) throw updateError

      await fetchApplications()
      return { success: true }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to save notes."
      setError(errMsg)
      return { success: false, error: err }
    } finally {
      setUpdating(false)
    }
  }

  return {
    applications,
    loading,
    updating,
    error,
    refresh: fetchApplications,
    updateApplicationStatus,
    saveApplicationNotes,
  }
}

