"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, BadgeCheck, Clock, AlertCircle, Mail } from "lucide-react"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { Reveal } from "@/components/motion/Reveal"
import { apiFetch } from "@/lib/api"
import { startProof } from "@/lib/proofs"
import { formatDate } from "@/lib/utils"
import type { ProofInvitation, SkillProof } from "@/types"

interface ProofsData {
  proofs: SkillProof[]
  invitations: ProofInvitation[]
  allowance: { used: number; limit: number }
}

function invitationStatus(inv: ProofInvitation, proof: SkillProof | undefined): string {
  if (inv.decision === "advanced") {
    if (inv.candidate_response === "accepted") return "Introduced: they have your contact details"
    if (inv.candidate_response === "declined") return "You declined the introduction"
    return "They want to talk to you"
  }
  if (inv.decision === "declined") return "Not moving forward"
  if (proof?.status === "completed" && inv.decision_due_at) return `Decision due by ${formatDate(inv.decision_due_at)}`
  if (proof?.status === "in_progress") return "Proof in progress"
  return "Invited: take the proof to apply"
}

export default function ProofsPage() {
  const router = useRouter()
  const [data, setData] = useState<ProofsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiFetch("/api/proofs")
    const body = await res.json()
    if (res.ok) setData(body)
    else setError(body.error || "Couldn't load your proofs.")
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const start = async (key: string, body: { posting_id?: string; job_id?: string }) => {
    setBusy(key); setError(null)
    try {
      router.push(`/proofs/${await startProof(body)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the proof.")
      setBusy(null)
    }
  }

  const respond = async (matchId: string, accept: boolean) => {
    setBusy(matchId); setError(null)
    const res = await apiFetch(`/api/proofs/invitations/${matchId}/respond`, { method: "POST", body: JSON.stringify({ accept }) })
    const body = await res.json()
    if (!res.ok) setError(body.error || "Couldn't save your answer.")
    await load()
    setBusy(null)
  }

  if (!data && !error) return <div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  const proofsById = new Map((data?.proofs ?? []).map((p) => [p.id, p]))
  const proofForPosting = (postingId: string) => data?.proofs.find((p) => p.posting_id === postingId)
  const card = "bg-card border border-border rounded-lg p-4"

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-6">
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Proof of Fit</h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
              Three questions about the work itself, about 15 minutes. You get a skill-by-skill report you can share,
              and recruiters who invite you must give you a decision within their deadline.
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">{data.allowance.used} of {data.allowance.limit} this month</span>
              <button onClick={() => start("own", {})} disabled={busy !== null}
                className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition-colors">
                {busy === "own" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                Prove my target role
              </button>
            </div>
          )}
        </div>
      </Reveal>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {data && data.invitations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invitations</h2>
          {data.invitations.map((inv) => {
            const proof = inv.proof_id ? proofsById.get(inv.proof_id) : proofForPosting(inv.posting_id)
            const canStart = inv.decision === "pending" && (!proof || proof.status === "abandoned")
            const awaitingMe = inv.decision === "advanced" && !inv.candidate_response
            return (
              <div key={inv.id} className={card}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{inv.posting?.title ?? "Role"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{inv.posting?.company} · {invitationStatus(inv, proof)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canStart && (
                      <button onClick={() => start(inv.id, { posting_id: inv.posting_id })} disabled={busy !== null}
                        className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50">
                        {busy === inv.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Start proof
                      </button>
                    )}
                    {proof?.status === "in_progress" && (
                      <Link href={`/proofs/${proof.id}`} className="text-xs font-medium border border-border px-3 py-1.5 rounded-md hover:border-foreground/40">Continue</Link>
                    )}
                    {awaitingMe && (
                      <>
                        <button onClick={() => respond(inv.id, true)} disabled={busy !== null}
                          className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50">
                          <Mail className="w-3.5 h-3.5" /> Share my contact details
                        </button>
                        <button onClick={() => respond(inv.id, false)} disabled={busy !== null}
                          className="text-xs border border-border px-3 py-1.5 rounded-md hover:border-foreground/40 disabled:opacity-50">
                          No thanks
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {inv.feedback && <p className="text-xs text-foreground/80 mt-3 pt-3 border-t border-border/60 leading-relaxed"><span className="font-medium">Feedback:</span> {inv.feedback}</p>}
              </div>
            )
          })}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your proofs</h2>
        {!data || data.proofs.length === 0 ? (
          <div className="text-center py-14 border border-dashed border-border rounded-lg">
            <BadgeCheck className="w-6 h-6 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No proofs yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
              Prove your target role above, or open any job and click <span className="font-medium text-foreground/80">Prove your fit</span>.
            </p>
          </div>
        ) : (
          data.proofs.map((p) => (
            <Link key={p.id} href={`/proofs/${p.id}`} className={`${card} flex items-center justify-between gap-3 hover:border-foreground/30 transition-colors`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.role_title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  {p.status === "completed" ? `Finished ${formatDate(p.completed_at)}${p.is_public ? " · shared" : ""}`
                    : p.status === "in_progress" ? <><Clock className="w-3 h-3" /> In progress</> : "Expired"}
                </p>
              </div>
              {p.status === "completed" && p.score !== null && <MatchScoreBadge score={p.score} size="sm" />}
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
