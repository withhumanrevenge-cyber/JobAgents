"use client"

import React, { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { ConsentModal } from "@/components/ui/ConsentModal"
import { CREDIT_COST } from "@/lib/plans"
import { ResumeData, Match, InterviewQuestion } from "@/types"
import { Loader2, Calendar, MapPin, DollarSign, ExternalLink, Briefcase, FileCheck, CheckCircle, MessageSquare, ChevronDown, Zap, Copy, X } from "lucide-react"
import { calculateDaysAgo } from "@/lib/utils"
import { Reveal } from "@/components/motion/Reveal"
import { spring } from "@/lib/motion"

const ResumePreview = dynamic(
  () => import("@/components/resume/ResumePreview").then((mod) => mod.ResumePreview),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> }
)

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function friendlyError(raw: string, fallback: string): string {
  const text = raw || ""
  if (/rate.?limit|429|tokens per day|TPD/i.test(text)) {
    const wait = text.match(/try again in ([\dhms.]+)/i)?.[1]
    return wait
      ? `AI is temporarily rate-limited. Try again in ${wait}.`
      : "AI is temporarily rate-limited. Please try again shortly."
  }
  if (/quota|insufficient|billing/i.test(text)) {
    return "AI quota reached for today. Please try again tomorrow."
  }
  if (text.trim().startsWith("{") || text.length > 160) return fallback
  return text || fallback
}

export default function JobDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const supabase = React.useMemo(() => createClient(), [])

  const [match, setMatch]                   = useState<Match | null>(null)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [actionError, setActionError]       = useState<string | null>(null)
  const [tailoring, setTailoring]           = useState(false)
  const [tailoredResume, setTailoredResume] = useState<ResumeData | null>(null)
  const [appliedLoading, setAppliedLoading] = useState(false)
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[] | null>(null)
  const [generatingInterview, setGeneratingInterview] = useState(false)
  const [openQuestion, setOpenQuestion]     = useState<number | null>(null)
  const [smartApplying, setSmartApplying]   = useState(false)
  const [coverLetter, setCoverLetter]       = useState<string | null>(null)
  const [smartPanelOpen, setSmartPanelOpen] = useState(false)
  const [copied, setCopied]                 = useState<"resume" | "letter" | null>(null)
  const [consentFor, setConsentFor]         = useState<"tailor" | "smart" | null>(null)

  const loadJobDetails = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError("Not authenticated."); setLoading(false); return }

      const jobId = params.id as string
      const { data: matchData } = await supabase
        .from("matches").select(`*, job:jobs(*)`).eq("user_id", user.id).eq("job_id", jobId).single()

      if (matchData) {
        setMatch(matchData)
        if (matchData.tailored_resume_json) setTailoredResume(matchData.tailored_resume_json)
        if (matchData.cover_letter) setCoverLetter(matchData.cover_letter)
        return
      }

      const { data: jobData, error: jobError } = await supabase.from("jobs").select("*").eq("id", jobId).single()
      if (jobError || !jobData) throw new Error("Job not found.")

      setMatch({
        interview_questions: null, interview_generated_at: null,
        cover_letter: null, cover_letter_generated_at: null,
        id: `pending-${jobData.id}`, user_id: user.id, job_id: jobData.id,
        job: jobData, match_score: -1, match_reason: null,
        matched_skills: [], missing_skills: [], status: "pending",
        tailored_resume_url: null, tailored_resume_json: null,
        applied_at: null, notes: null, created_at: jobData.created_at,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load job.")
    } finally { setLoading(false) }
  }, [params.id, supabase])

  useEffect(() => { if (params.id) loadJobDetails() }, [params.id, loadJobDetails])
  useEffect(() => {
    if (match?.interview_questions?.length) setInterviewQuestions(match.interview_questions)
  }, [match])

  const handleGenerateInterview = async () => {
    if (!match) return
    setGeneratingInterview(true); setActionError(null)
    try {
      const res = await fetch("/api/interview/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: match.id, job_id: match.job_id }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed.") }
      const data = await res.json()
      setInterviewQuestions(data.questions)
      setMatch((prev) => prev ? { ...prev, interview_questions: data.questions, interview_generated_at: new Date().toISOString() } : null)
    } catch (err: unknown) { setActionError(friendlyError(err instanceof Error ? err.message : "", "Interview generation failed.")) }
    finally { setGeneratingInterview(false) }
  }

  const handleTailorResume = async () => {
    if (!match) return
    setTailoring(true); setActionError(null)
    try {
      const res = await fetch("/api/resume/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: match.job_id }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to tailor resume.") }
      const result = await res.json()
      setTailoredResume(result.resume_json)
    } catch (err: unknown) { setActionError(friendlyError(err instanceof Error ? err.message : "", "Resume tailoring failed.")) }
    finally { setTailoring(false) }
  }

  const handleSaveResumeEdits = async (updatedResume: ResumeData) => {
    if (!match) return
    try {
      const { error: e } = await supabase.from("matches").update({ tailored_resume_json: updatedResume }).eq("id", match.id)
      if (e) throw e
      setTailoredResume(updatedResume)
    } catch { setActionError("Failed to save resume updates.") }
  }

  const handleSmartApply = async () => {
    if (!match) return
    setSmartApplying(true); setActionError(null)
    try {
      const res = await fetch("/api/apply/smart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: match.job_id }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Smart apply failed.") }
      const data = await res.json()
      setTailoredResume(data.tailored_resume)
      setCoverLetter(data.cover_letter)
      setSmartPanelOpen(true)
    } catch (err: unknown) {
      setActionError(friendlyError(err instanceof Error ? err.message : "", "Smart Apply failed. Please try again."))
    } finally { setSmartApplying(false) }
  }

  const handleCopy = async (text: string, kind: "resume" | "letter") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1800)
    } catch { setActionError("Clipboard not available.") }
  }

  const handleMarkAsApplied = async () => {
    if (!match) return
    setAppliedLoading(true); setActionError(null)
    try {
      if (match.id.startsWith("pending-")) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Not authenticated.")
        const { data: inserted, error: insertErr } = await supabase
          .from("matches")
          .insert({
            user_id: user.id,
            job_id: match.job_id,
            match_score: -1,
            match_reason: "Manually tracked — not scored by AI.",
            matched_skills: [],
            missing_skills: [],
            status: "applied",
            applied_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (insertErr) throw insertErr
        setMatch((prev) => prev ? { ...prev, ...inserted, job: prev.job } : null)
      } else {
        const res = await fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: match.id }) })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed.") }
        setMatch((prev) => prev ? { ...prev, status: "applied", applied_at: new Date().toISOString() } : null)
      }
    } catch (err: unknown) { setActionError(friendlyError(err instanceof Error ? err.message : "", "Could not record application.")) }
    finally { setAppliedLoading(false) }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  if (error || !match || !match.job) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center">
        <p className="text-sm text-red-600 mb-4">{error || "Job not found."}</p>
        <button onClick={() => router.push("/jobs")} className="border border-border text-sm text-foreground/90 px-4 py-2 rounded-md hover:border-foreground/40 transition-colors">
          Back to jobs
        </button>
      </div>
    )
  }

  const job   = match.job
  const card   = "bg-card border border-border rounded-lg p-4 space-y-3"

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-6">
      <Reveal>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start border-b border-border/60 pb-5 gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground leading-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap sm:justify-end">
          {coverLetter && !smartPanelOpen ? (
            <button onClick={() => setSmartPanelOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-colors">
              <Zap className="w-3.5 h-3.5" /> View Smart Apply
            </button>
          ) : (
            <button onClick={() => setConsentFor("smart")} disabled={smartApplying}
              className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-colors">
              {smartApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {smartApplying ? "Preparing..." : "Smart Apply"}
            </button>
          )}
          {match.status === "applied" ? (
            <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-md">
              <CheckCircle className="w-3.5 h-3.5" /> Applied
            </span>
          ) : (
            <button onClick={handleMarkAsApplied} disabled={appliedLoading}
              className="flex items-center gap-1.5 text-xs font-medium border border-border text-foreground/90 px-3 py-1.5 rounded-md hover:border-foreground/40 disabled:opacity-50 transition-colors">
              {appliedLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
              Mark applied
            </button>
          )}
          <a href={job.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-foreground/80 border border-border px-3 py-1.5 rounded-md hover:border-foreground/40 transition-colors">
            Apply page <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      </Reveal>

      {actionError && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-700 shrink-0">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-3 gap-4">
            {[
              { icon: MapPin, label: "Location", value: job.location || "Remote" },
              { icon: Calendar, label: "Posted",   value: calculateDaysAgo(job.posted_date) },
              { icon: DollarSign, label: "Salary",  value: job.salary_range || "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="text-xs font-medium text-foreground/90">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className={card}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</p>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap select-text">
              {stripHtml(job.description || "No description available.")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className={card}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Match</p>
            {match.match_score < 0 ? (
              <p className="text-xs text-muted-foreground">Run the agent to score this job.</p>
            ) : (
              <>
                <MatchScoreBadge score={match.match_score} size="lg" />
                {match.match_reason && (
                  <p className="text-xs text-muted-foreground italic leading-relaxed border border-border/60 rounded-md p-2 bg-muted">&quot;{match.match_reason}&quot;</p>
                )}
                <div className="space-y-2 pt-1">
                  <div>
                    <p className="text-[9px] text-green-700 font-medium uppercase mb-1">Matched skills</p>
                    <div className="flex flex-wrap gap-1">
                      {match.matched_skills.length === 0
                        ? <span className="text-xs text-muted-foreground italic">None detected</span>
                        : match.matched_skills.map((s, i) => <span key={i} className="bg-green-50 border border-green-200 text-[9px] text-green-700 px-2 py-0.5 rounded">{s}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] text-amber-700 font-medium uppercase mb-1">Missing skills</p>
                    <div className="flex flex-wrap gap-1">
                      {match.missing_skills.length === 0
                        ? <span className="text-xs text-muted-foreground italic">None</span>
                        : match.missing_skills.map((s, i) => <span key={i} className="bg-amber-50 border border-amber-200 text-[9px] text-amber-700 px-2 py-0.5 rounded">{s}</span>)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resume</p>
              {tailoredResume?.ats_score !== undefined && (
                <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${tailoredResume.ats_score >= 75 ? "bg-green-50 border-green-200 text-green-700" : tailoredResume.ats_score >= 50 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  ATS {tailoredResume.ats_score}%
                </span>
              )}
            </div>
            {tailoredResume ? (
              <ResumePreview initialData={tailoredResume} onSave={handleSaveResumeEdits} />
            ) : (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">Rewrite your resume to match this job&apos;s requirements and maximize ATS score.</p>
                <button onClick={() => setConsentFor("tailor")} disabled={tailoring}
                  className="w-full bg-primary text-primary-foreground text-xs font-medium py-2 rounded-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {tailoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />}
                  {tailoring ? "Tailoring..." : "Tailor resume"}
                </button>
              </div>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Interview prep</p>
              {interviewQuestions && <span className="text-[9px] text-muted-foreground">{interviewQuestions.length} questions</span>}
            </div>
            {!interviewQuestions ? (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">10 targeted questions — technical, behavioral, and role-specific.</p>
                <button onClick={handleGenerateInterview} disabled={generatingInterview}
                  className="w-full bg-primary text-primary-foreground text-xs font-medium py-2 rounded-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {generatingInterview && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {generatingInterview ? "Generating..." : "Generate questions"}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {interviewQuestions.map((q, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: idx * 0.04 }}
                    className="border border-border rounded-md overflow-hidden"
                  >
                    <button onClick={() => setOpenQuestion(openQuestion === idx ? null : idx)}
                      className="w-full flex items-start justify-between gap-3 p-2.5 text-left hover:bg-muted transition-colors">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className={`text-[8px] font-medium border rounded px-1.5 py-0.5 shrink-0 mt-0.5 ${
                          q.category === "technical"     ? "bg-blue-50 border-blue-200 text-blue-700" :
                          q.category === "behavioral"    ? "bg-purple-50 border-purple-200 text-purple-700" :
                          q.category === "role-specific" ? "bg-green-50 border-green-200 text-green-700" :
                          "bg-muted border-border text-foreground/80"
                        }`}>{q.category}</span>
                        <p className="text-xs text-foreground/80 leading-relaxed">{q.question}</p>
                      </div>
                      <motion.span animate={{ rotate: openQuestion === idx ? 180 : 0 }} transition={spring} className="shrink-0 mt-1">
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openQuestion === idx && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={spring}
                          className="overflow-hidden bg-muted border-t border-border/60"
                        >
                          <p className="text-xs text-muted-foreground italic leading-relaxed px-3 py-2">
                            <span className="font-medium text-foreground/90 not-italic">Tip: </span>{q.tip}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
                <button onClick={handleGenerateInterview} disabled={generatingInterview}
                  className="w-full mt-1 text-[10px] text-muted-foreground hover:text-foreground/90 flex items-center justify-center gap-1 transition-colors">
                  {generatingInterview && <Loader2 className="w-3 h-3 animate-spin" />} Regenerate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {smartPanelOpen && coverLetter && (
          <>
            <motion.div
              key="smart-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setSmartPanelOpen(false)}
            />
            <motion.aside
              key="smart-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={spring}
              className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-card border-l border-border z-50 flex flex-col shadow-xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Smart Apply</p>
                  <p className="text-sm font-semibold text-foreground">{job.title}</p>
                </div>
                <button onClick={() => setSmartPanelOpen(false)}
                  className="w-7 h-7 border border-border rounded-md flex items-center justify-center text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs font-medium text-blue-800 mb-0.5">Materials ready</p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">Copy the cover letter, download the tailored PDF from the Resume panel, then open the apply page below and submit on the original site.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cover letter</p>
                    <button onClick={() => handleCopy(coverLetter, "letter")}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border px-2 py-0.5 rounded transition-colors">
                      {copied === "letter" ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      {copied === "letter" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="border border-border rounded-md p-3 bg-muted">
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{coverLetter}</p>
                  </div>
                </div>

                {tailoredResume && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tailored resume summary</p>
                      <button onClick={() => handleCopy(tailoredResume.summary, "resume")}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border px-2 py-0.5 rounded transition-colors">
                        {copied === "resume" ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        {copied === "resume" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="border border-border rounded-md p-3 bg-muted">
                      <p className="text-xs text-foreground/90 leading-relaxed">{tailoredResume.summary}</p>
                      {typeof tailoredResume.ats_score === "number" && (
                        <p className="text-[10px] text-muted-foreground mt-2">ATS score: <span className="font-semibold text-foreground">{tailoredResume.ats_score}%</span></p>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">Full PDF available in the Resume panel of this page. Download and attach it on the application form.</p>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-border/60 flex gap-2">
                <a href={job.url} target="_blank" rel="noreferrer"
                  className="flex-1 bg-primary text-primary-foreground text-xs font-medium py-2 rounded-md hover:opacity-90 transition-colors flex items-center justify-center gap-1.5">
                  Open apply page <ExternalLink className="w-3 h-3" />
                </a>
                {match.status !== "applied" && (
                  <button onClick={handleMarkAsApplied} disabled={appliedLoading}
                    className="border border-border text-xs text-foreground/90 px-3 py-2 rounded-md hover:border-foreground/40 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {appliedLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCheck className="w-3 h-3" />}
                    Mark applied
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConsentModal
        open={consentFor !== null}
        title={consentFor === "smart" ? "Run Smart Apply?" : "Tailor your resume with AI?"}
        points={consentFor === "smart" ? [
          "Your resume and this job's description will be processed by our AI service to generate a tailored resume and a personalized cover letter.",
          `This uses ${CREDIT_COST.smart_apply} credits from your monthly allowance.`,
          "AI output can contain mistakes — review both documents before applying.",
        ] : [
          "Your resume and this job's description will be processed by our AI service to generate a tailored version.",
          `This uses ${CREDIT_COST.tailor} credits from your monthly allowance.`,
          "AI output can contain mistakes — review the result before sending it to an employer.",
        ]}
        confirmLabel="I agree — continue"
        onConfirm={() => {
          const action = consentFor
          setConsentFor(null)
          if (action === "smart") handleSmartApply()
          else if (action === "tailor") handleTailorResume()
        }}
        onCancel={() => setConsentFor(null)}
      />
    </div>
  )
}
