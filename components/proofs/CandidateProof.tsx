"use client"

import { useState } from "react"
import { Loader2, BadgeCheck, Clock, ChevronDown } from "lucide-react"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { ProofReport } from "@/components/proofs/ProofReport"
import { apiFetch } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import type { CandidateMatch, ProofDecision } from "@/types"

function daysLeft(due: string): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000)
}

// A candidate's Proof of Fit on the recruiter's list: invite, read the report, decide in time.
export function CandidateProof({ match, onChange }: { match: CandidateMatch; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [feedback, setFeedback] = useState("")

  const call = async (path: string, body?: object) => {
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Something went wrong.")
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally { setBusy(false) }
  }
  const decide = (decision: ProofDecision) =>
    call(`/api/hire/candidates/${match.id}/decision`, { decision, feedback: feedback.trim() || null })

  const btn = "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
  const primary = `${btn} bg-primary text-primary-foreground hover:opacity-90`
  const secondary = `${btn} border border-border hover:border-foreground/40`

  let body: React.ReactNode
  if (!match.invited_at) {
    body = (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted-foreground">Invite them to a 15-minute work sample for this role. You&apos;ll owe them a decision within your response window once they finish.</p>
        <button onClick={() => call(`/api/hire/candidates/${match.id}/invite`)} disabled={busy} className={`${primary} shrink-0`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />} Invite to Proof of Fit
        </button>
      </div>
    )
  } else if (!match.proof) {
    body = <p className="text-xs text-muted-foreground">Invited {formatDate(match.invited_at)} · waiting for their proof.</p>
  } else {
    const left = match.decision_due_at ? daysLeft(match.decision_due_at) : null
    body = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-xs font-medium text-foreground">
            Proof of Fit <MatchScoreBadge score={match.proof.score} size="sm" />
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {match.decision === "pending" && left !== null && (
            <span className={`flex items-center gap-1 text-[11px] ${left <= 2 ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>
              <Clock className="w-3 h-3" />{left > 0 ? `Decide within ${left} day${left === 1 ? "" : "s"}` : "Due today"}
            </span>
          )}
        </div>
        {open ? <ProofReport report={match.proof.report} /> : <p className="text-xs text-foreground/80 leading-relaxed">{match.proof.report.summary}</p>}

        {match.decision === "pending" && !declining && (
          <div className="flex gap-2">
            <button onClick={() => decide("advanced")} disabled={busy} className={primary}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Advance
            </button>
            <button onClick={() => setDeclining(true)} disabled={busy} className={secondary}>Decline</button>
          </div>
        )}
        {match.decision === "pending" && declining && (
          <div className="space-y-2">
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} rows={3}
              placeholder="Feedback for the candidate (optional; if empty, we send feedback from their report)"
              className="w-full bg-card border border-border rounded-md p-2 text-xs text-foreground focus:outline-none focus:border-foreground" />
            <div className="flex gap-2">
              <button onClick={() => decide("declined")} disabled={busy} className={primary}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send decline
              </button>
              <button onClick={() => setDeclining(false)} disabled={busy} className={secondary}>Cancel</button>
            </div>
          </div>
        )}
        {match.decision === "advanced" && (
          <p className="text-xs text-green-700">
            Advanced {formatDate(match.decided_at)} · {match.candidate_response === "accepted" ? "they accepted the introduction"
              : match.candidate_response === "declined" ? "they declined the introduction" : "waiting for them to accept the introduction"}
          </p>
        )}
        {match.decision === "declined" && (
          <p className="text-xs text-muted-foreground">
            Declined {formatDate(match.decided_at)}{match.feedback ? `: “${match.feedback}”` : ""}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      {body}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
