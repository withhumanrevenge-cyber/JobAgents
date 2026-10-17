import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import type { Plan } from "@/types"

// byok: the user's own key, no credits. hosted: our AI on plan credits. trial: Free without a
// key, a small hosted allowance.
export type AIMode = "byok" | "hosted" | "trial"

export interface AIProviderInfo {
  id: string
  label: string
  key_url: string
  note: string
}

export interface AIKeyInfo {
  provider: string
  provider_label: string
  hint: string
  status: "valid" | "invalid"
  last_error: string | null
  fast_model: string | null
  quality_model: string | null
  use_own_key: boolean
  background_matching: boolean
  verified_at: string | null
}

export interface AISettings {
  plan: Plan
  mode: AIMode
  key: AIKeyInfo | null
  providers: AIProviderInfo[]
}

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ai/settings")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't load AI settings.")
      setSettings(data)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't load AI settings.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/ai/settings")
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (res.ok) setSettings(data)
        else setError(data.error || "Couldn't load AI settings.")
      })
      .catch(() => { if (!cancelled) setError("Couldn't load AI settings.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { settings, setSettings, loading, error, reload }
}
