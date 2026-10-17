import { apiFetch } from "@/lib/api"

const MAX_CALLS = 40
const MAX_STALLS = 3

export interface ScoreRun {
  scored: number
  // The Free trial (no own key) hit its per-search or daily scoring limit.
  limited: boolean
}

// Problems the user fixes in Settings → AI provider (rejected key, quota, bad model).
export class AIKeyError extends Error {}

// One "Find jobs" run: calls /api/match until the backend reports nothing left. Every call
// carries the run's start time, which is what the backend counts the plan's per-run cap from.
// Throws on errors the user must act on (no resume, a problem with their AI key).
export async function scoreNewJobs(onBatch?: (remaining: number) => void): Promise<ScoreRun> {
  const body = JSON.stringify({ run_started_at: new Date().toISOString() })
  let scored = 0
  let stalls = 0
  let limited = false

  for (let i = 0; i < MAX_CALLS && stalls < MAX_STALLS; i++) {
    let res: Response
    let data: { matched?: number; skipped?: number; remaining?: number; limited?: boolean; error?: string; code?: string }
    try {
      res = await apiFetch("/api/match", { method: "POST", body })
      data = await res.json()
    } catch {
      // Network hiccup: some jobs may still have been scored server-side. Retry a few times.
      stalls++
      continue
    }
    if (!res.ok) {
      if (data?.code?.startsWith("ai_")) throw new AIKeyError(data.error || "There's a problem with your AI key.")
      if (res.status === 400 || res.status === 402) throw new Error(data?.error || "Scoring failed.")
      stalls++
      continue
    }

    const progress = (data.matched ?? 0) + (data.skipped ?? 0)
    scored += progress
    limited = limited || !!data.limited
    // A call that scores nothing (e.g. the AI is failing) counts as a stall, so the loop ends.
    stalls = progress > 0 ? 0 : stalls + 1
    const remaining = Number(data.remaining ?? 0)
    onBatch?.(remaining)
    if (remaining <= 0) break
  }
  return { scored, limited }
}
