"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft, Clock, AlertCircle, Link2, Check, ChevronDown } from "lucide-react"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { ProofReport } from "@/components/proofs/ProofReport"
import { apiFetch } from "@/lib/api"
import type { SkillProof, ProofStep } from "@/types"

const MAX_CHARS = 4000

function useSecondsLeft(step: ProofStep | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!step?.asked_at) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step?.asked_at])
  if (!step?.asked_at) return null
  return Math.round(step.time_limit_s - (now - new Date(step.asked_at).getTime()) / 1000)
}

function clock(seconds: number): string {
  const s = Math.abs(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// A refresh mid-answer shouldn't lose the draft. Per-tab only; failures are harmless.
const draftKey = (id: string, n: number) => `proof-draft:${id}:${n}`
function readDraft(key: string): string {
  try { return sessionStorage.getItem(key) ?? "" } catch { return "" }
}
function writeDraft(key: string, value: string | null) {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

export default function ProofPage() {
  const id = useParams().id as string
  const [proof, setProof] = useState<SkillProof | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState("")
  const [pasted, setPasted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAnswers, setShowAnswers] = useState(false)
  const secondsLeft = useSecondsLeft(proof?.step)

  const show = useCallback((p: SkillProof) => {
    setProof(p)
    setAnswer(p.step ? readDraft(draftKey(p.id, p.step.number)) : "")
    setPasted(false)
  }, [])

  useEffect(() => {
    void apiFetch(`/api/proofs/${id}`).then(async (res) => {
      const body = await res.json()
      if (res.ok) show(body)
      else setError(body.error || "Couldn't load this proof.")
    })
  }, [id, show])

  const submit = async () => {
    if (!proof) return
    setSubmitting(true); setError(null)
    try {
      const res = await apiFetch(`/api/proofs/${proof.id}/answer`, { method: "POST", body: JSON.stringify({ answer, pasted }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Couldn't save your answer.")
      if (proof.step) writeDraft(draftKey(proof.id, proof.step.number), null)
      show(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answer.")
    } finally { setSubmitting(false) }
  }

  const setShared = async (isPublic: boolean) => {
    if (!proof) return
    const res = await apiFetch(`/api/proofs/${proof.id}`, { method: "PATCH", body: JSON.stringify({ is_public: isPublic }) })
    const body = await res.json()
    if (res.ok) setProof(body)
    else setError(body.error || "Couldn't update sharing.")
  }

  const copyLink = async () => {
    if (!proof?.public_slug) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${proof.public_slug}`)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { setError("Couldn't copy. Select the link and copy it yourself.") }
  }

  const back = (
    <Link href="/proofs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="w-3.5 h-3.5" /> All proofs
    </Link>
  )
  const errorBox = error && (
    <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs flex items-center gap-2">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
    </div>
  )

  if (!proof) {
    return error
      ? <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-4">{back}{errorBox}</div>
      : <div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  const step = proof.step
  const over = secondsLeft !== null && secondsLeft < 0
  const publicUrl = proof.public_slug ? `/p/${proof.public_slug}` : null

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5">
      {back}
      <div className="border-b border-border/60 pb-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Proof of Fit</p>
        <h1 className="text-lg font-semibold text-foreground mt-0.5">{proof.role_title}</h1>
      </div>
      {errorBox}

      {proof.status === "abandoned" && (
        <p className="text-sm text-muted-foreground">This proof expired before it was finished. Start a new one from <Link href="/proofs" className="underline text-foreground">your proofs</Link>.</p>
      )}

      {proof.status === "in_progress" && step && (
        <div className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              Question {step.number} of {step.total} · {step.kind === "followup" ? "Follow-up" : step.skill}
            </span>
            {secondsLeft !== null && (
              <span className={`flex items-center gap-1 tabular-nums font-medium ${over ? "text-amber-700" : secondsLeft < 60 ? "text-amber-700" : "text-foreground/80"}`}>
                <Clock className="w-3.5 h-3.5" />{over ? `${clock(secondsLeft)} over` : clock(secondsLeft)}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{step.question}</p>
          <textarea
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); writeDraft(draftKey(proof.id, step.number), e.target.value) }}
            onPaste={() => setPasted(true)}
            maxLength={MAX_CHARS}
            rows={9}
            placeholder="Explain what you'd do, how, and why. Specifics beat length."
            className="w-full bg-card border border-border rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-foreground resize-y"
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {over ? "You're over time. You can still submit; it'll be marked as late." : "Write in your own words. Pasted answers are noted on your report."}
            </p>
            <button onClick={submit} disabled={submitting || !answer.trim()}
              className="flex items-center justify-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition-colors shrink-0">
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? (step.number === step.total ? "Grading your answers…" : "Saving…") : step.number === step.total ? "Submit and get my report" : "Submit answer"}
            </button>
          </div>
        </div>
      )}

      {proof.status === "in_progress" && !step && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm text-foreground">Your answers are saved, but grading didn&apos;t finish.</p>
          <button onClick={submit} disabled={submitting}
            className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-md hover:opacity-90 disabled:opacity-50">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Grade my answers
          </button>
        </div>
      )}

      {proof.status === "completed" && proof.report && (
        <>
          <div className="bg-card border border-border rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Your report</p>
              <MatchScoreBadge score={proof.report.overall} size="lg" />
            </div>
            <ProofReport report={proof.report} />
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Share this proof</p>
                <p className="text-xs text-muted-foreground mt-0.5">Anyone with the link sees the report and quotes, never your full answers or contact details.</p>
              </div>
              <button onClick={() => setShared(!proof.is_public)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors shrink-0 ${proof.is_public ? "border-border hover:border-foreground/40" : "bg-primary text-primary-foreground border-transparent hover:opacity-90"}`}>
                {proof.is_public ? "Stop sharing" : "Create link"}
              </button>
            </div>
            {proof.is_public && publicUrl && (
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs bg-muted border border-border rounded px-2 py-1.5">{publicUrl}</code>
                <button onClick={copyLink} className="flex items-center gap-1 text-xs border border-border px-2.5 py-1.5 rounded-md hover:border-foreground/40 shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}{copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>

          {proof.answers && (
            <div className="bg-card border border-border rounded-lg">
              <button onClick={() => setShowAnswers(!showAnswers)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-foreground">
                Your answers <ChevronDown className={`w-4 h-4 transition-transform ${showAnswers ? "rotate-180" : ""}`} />
              </button>
              {showAnswers && (
                <div className="px-4 pb-4 space-y-4">
                  {proof.answers.map((a, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {a.kind === "followup" ? "Follow-up" : a.skill} · {a.seconds ?? "?"}s{a.pasted ? " · pasted" : ""}{a.late ? " · late" : ""}
                      </p>
                      <p className="text-xs font-medium text-foreground">{a.question}</p>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{a.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
