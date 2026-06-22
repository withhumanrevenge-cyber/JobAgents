import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Profile } from "@/types"

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === "string" && m.length > 0) return m
  }
  return fallback
}

export function useProfile() {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true)
        setError(null)
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError("User not authenticated.")
          setLoading(false)
          return
        }

        const { data: existingData, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .single()

        let data = existingData

        if (fetchError && fetchError.code === "PGRST116") {
          const { data: newProfile, error: insertError } = await supabase
            .from("profiles")
            .insert({
              user_id: user.id,
              full_name: user.user_metadata?.full_name || "",
              match_threshold: 70,
              auto_apply: false,
            })
            .select()
            .single()

          if (insertError) throw insertError
          data = newProfile
        } else if (fetchError) {
          throw fetchError
        }

        setProfile(data)
      } catch (err: unknown) {
        setError(extractErrorMessage(err, "Failed to load profile."))
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [supabase])

  const updateProfile = async (updates: Partial<Profile>) => {
    try {
      setSaving(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("User not authenticated.")

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select()
        .single()

      if (updateError) throw updateError
      setProfile(data)
      return { success: true as const, data }
    } catch (err: unknown) {
      const message = extractErrorMessage(err, "Failed to save profile.")
      setError(message)
      return { success: false as const, error: message }
    } finally {
      setSaving(false)
    }
  }

  return {
    profile,
    loading,
    saving,
    error,
    updateProfile,
  }
}

