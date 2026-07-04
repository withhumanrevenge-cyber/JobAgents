"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Loader2, ArrowLeft, Sparkles, Mail, ExternalLink, Users, SlidersHorizontal } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { JOB_TYPE_LABEL, EXPERIENCE_LABEL } from "@/lib/status"
import type { JobPosting, CandidateMatch, CandidateStatus, JobType, ExperienceLevel } from "@/types"

const STATUS_OPTIONS: CandidateStatus[] = ["new", "shortlisted", "contacted", "rejected"]

export default function PostingDetailPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = useMemo(() => createClient(), [])

  const [posting, setPosting] = useState<JobPosting | null>(null)
  const [candidates, setCandidates] = useState<CandidateMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [minScore, setMinScore] = useState(70)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/hire/postings/${id}/candidates`)
    const data = await res.json()
    if (!data.error) {
      setPosting(data.posting)
      setCandidates(data.candidates)
      if (typeof data.threshold === "number") setMinScore(data.threshold)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const setThreshold = (value: number) => {
    setMinScore(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from("profiles").update({ match_threshold: value }).eq("user_id", user.id)
    }, 600)
  }

  const findCandidates = async () => {
    setScanning(true); setError(null)
    try {
      const res = await fetch(`/api/hire/postings/${id}/candidates`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Scan failed.")
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed.")
    } finally { setScanning(false) }
  }

  const setStatus = async (matchId: string, status: CandidateStatus) => {
    setCandidates((prev) => prev.map((c) => (c.id === matchId ? { ...c, status } : c)))
    await fetch(`/api/hire/candidates/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  }

  const visibleCandidates = candidates.filter((c) => c.match_score >= minScore)

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (!posting) return <div className="text-center py-16 text-sm text-gray-500">Posting not found. <Link href="/hire" className="text-gray-900 underline">Back to hiring</Link></div>

  return (
    <div className="space-y-6">
      <Link href="/hire" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">{posting.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {posting.company} · {posting.location || "—"} · {JOB_TYPE_LABEL[posting.job_type as JobType] ?? posting.job_type} · {EXPERIENCE_LABEL[posting.experience_level as ExperienceLevel] ?? posting.experience_level}
          </p>
          {posting.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {posting.skills.map((s, i) => <span key={i} className="bg-gray-100 text-[10px] text-gray-600 px-2 py-0.5 rounded">{s}</span>)}
            </div>
          )}
        </div>
        <button onClick={findCandidates} disabled={scanning}
          className="flex items-center justify-center gap-1.5 bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0">
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {scanning ? "Scanning talent pool…" : "Find candidates"}
        </button>
      </div>

      {error && <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">Min match score</span>
          <span className="text-xs font-semibold text-gray-900 tabular-nums w-9">{minScore}%</span>
        </div>
        <input type="range" min="0" max="100" step="5" value={minScore}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full sm:flex-1 h-1 bg-gray-200 rounded appearance-none cursor-pointer accent-gray-900" />
        <p className="text-xs text-gray-400 shrink-0">
          {visibleCandidates.length} of {candidates.length} shown
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-gray-200 rounded-lg">
          <Users className="w-6 h-6 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No candidates scored yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Click <span className="font-medium text-gray-600">Find candidates</span> to scan the opt-in talent pool and rank matches for this role.
          </p>
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-gray-200 rounded-lg">
          <Users className="w-6 h-6 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No candidates at {minScore}%+ match</p>
          <p className="text-xs text-gray-400 mt-1">Lower the threshold to see more of the {candidates.length} scored candidate{candidates.length === 1 ? "" : "s"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCandidates.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{c.candidate?.full_name || "Candidate"}</p>
                    <MatchScoreBadge score={c.match_score} size="sm" />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.candidate?.parsed_resume?.target_role || "—"}
                    {typeof c.candidate?.parsed_resume?.years_experience === "number" ? ` · ${c.candidate.parsed_resume.years_experience}y exp` : ""}
                  </p>
                </div>
                <select value={c.status} onChange={(e) => setStatus(c.id, e.target.value as CandidateStatus)}
                  className="bg-white border border-gray-200 text-xs text-gray-600 rounded-md py-1 px-2 focus:outline-none focus:border-gray-900 cursor-pointer capitalize shrink-0">
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {c.match_reason && <p className="text-xs text-gray-600 italic mt-2 leading-relaxed">&quot;{c.match_reason}&quot;</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-[9px] text-green-700 font-medium uppercase mb-1">Matched</p>
                  <div className="flex flex-wrap gap-1">
                    {c.matched_skills.length === 0 ? <span className="text-[11px] text-gray-400 italic">None</span>
                      : c.matched_skills.map((s, i) => <span key={i} className="bg-green-50 border border-green-200 text-[9px] text-green-700 px-1.5 py-0.5 rounded">{s}</span>)}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-amber-700 font-medium uppercase mb-1">Missing</p>
                  <div className="flex flex-wrap gap-1">
                    {c.missing_skills.length === 0 ? <span className="text-[11px] text-gray-400 italic">None</span>
                      : c.missing_skills.map((s, i) => <span key={i} className="bg-amber-50 border border-amber-200 text-[9px] text-amber-700 px-1.5 py-0.5 rounded">{s}</span>)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                {c.candidate?.email && (
                  <a href={`mailto:${c.candidate.email}`} className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> {c.candidate.email}
                  </a>
                )}
                {c.candidate?.linkedin_url && (
                  <a href={c.candidate.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
