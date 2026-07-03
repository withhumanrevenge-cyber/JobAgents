"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { ResumeUpload } from "@/components/resume/ResumeUpload"
import { TagInput } from "@/components/ui/TagInput"
import { ParsedResume } from "@/types"
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries"
import { Loader2, Check, User, Mail, Phone, Link2, ChevronRight, ChevronLeft, FileText } from "lucide-react"
import { slideHorizontal } from "@/lib/motion"

const STEPS = [
  { id: 1, title: "Your details",  description: "Name, email, and links so we can address you" },
  { id: 2, title: "Upload resume", description: "We extract your skills and experience to match jobs against" },
  { id: 3, title: "Preferences",   description: "How strict should matching be?" },
]

export default function OnboardingPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [step, setStep]     = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const prefersReduced = useReducedMotion()

  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  const [fullName, setFullName]   = useState("")
  const [email, setEmail]         = useState("")
  const [phone, setPhone]         = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")

  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null)
  const [resumeUrl, setResumeUrl]       = useState<string | null>(null)
  const [targetRoles, setTargetRoles]   = useState<string[]>([])
  const [targetCountry, setTargetCountry] = useState<string>(DEFAULT_COUNTRY)

  const [matchThreshold, setMatchThreshold] = useState(70)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }
      setEmail(user.email || "")
      const name = user.user_metadata?.full_name || user.user_metadata?.name || ""
      if (name) setFullName(name)

      const { data: profile } = await supabase.from("profiles").select("onboarded").eq("user_id", user.id).single()
      if (profile?.onboarded) router.replace("/dashboard")
    }
    init()
  }, [supabase, router])

  const handleResumeParsed = (resume: ParsedResume, url: string) => {
    setParsedResume(resume); setResumeUrl(url)
    if (!fullName && resume.name)   setFullName(resume.name)
    if (!email    && resume.email)  setEmail(resume.email)
    if (!phone    && resume.phone)  setPhone(resume.phone)
    if (targetRoles.length === 0 && resume.target_role) setTargetRoles([resume.target_role])
  }

  const handleFinish = async () => {
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated.")
      const { error: upsertError } = await supabase.from("profiles").upsert({
        user_id: user.id, full_name: fullName, email, phone,
        linkedin_url: linkedinUrl || null,
        base_resume_url: resumeUrl || null, parsed_resume: parsedResume || null,
        resume_parsed_at: parsedResume ? new Date().toISOString() : null,
        target_roles: targetRoles,
        target_country: targetCountry,
        match_threshold: matchThreshold, auto_apply: false, onboarded: true,
      }, { onConflict: "user_id" })
      if (upsertError) throw upsertError

      if (parsedResume) {
        fetch("/api/jobs/fetch", { method: "POST" })
          .then(() => fetch("/api/match", { method: "POST" }))
          .catch(() => {})
      }

      router.push("/dashboard?just_onboarded=1")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message
        : (err && typeof err === "object" && "message" in err && (err as { message?: unknown }).message)
          ? String((err as { message: unknown }).message)
        : "Failed to save. Please try again."
      setError(msg)
    } finally { setSaving(false) }
  }

  const handleSkip = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("profiles").upsert({
          user_id: user.id,
          full_name: fullName || (await supabase.auth.getUser()).data.user?.user_metadata?.full_name || "",
          email: email || (await supabase.auth.getUser()).data.user?.email || "",
          match_threshold: 70,
          auto_apply: false,
          onboarded: true,
        }, { onConflict: "user_id" })
      }
    } finally {
      router.push("/dashboard")
    }
  }

  const canProceedStep1 = fullName.trim() && email.trim()

  const inputCls = "w-full border border-gray-200 rounded-md py-2.5 px-3 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors"

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-4 py-8 sm:py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6 sm:mb-8">
          <p className="text-sm font-semibold text-gray-900 mb-1">JobAgent</p>
          <h1 className="text-2xl font-bold text-gray-900">Get started</h1>
          <p className="text-gray-500 text-sm mt-1">Complete your profile to start finding jobs that fit.</p>
        </div>

        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 transition-all shrink-0 ${step >= s.id ? "opacity-100" : "opacity-30"}`}>
                <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                  step > s.id ? "bg-gray-900 border-gray-900 text-white"
                  : step === s.id ? "border-gray-900 text-gray-900 bg-white"
                  : "border-gray-300 text-gray-400 bg-white"
                }`}>
                  {step > s.id ? <Check className="w-3 h-3" /> : s.id}
                </div>
                <span className={`text-[10px] font-medium hidden sm:block ${step === s.id ? "text-gray-900" : "text-gray-400"}`}>{s.title}</span>
              </div>
              {idx < STEPS.length - 1 && <div className={`flex-1 h-px max-w-[24px] ${step > s.id ? "bg-gray-900" : "bg-gray-200"}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-900">{STEPS[step - 1].title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{STEPS[step - 1].description}</p>
          </div>

          {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs">{error}</div>}

          <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={prefersReduced ? undefined : slideHorizontal}
            initial="enter"
            animate="center"
            exit="exit"
          >
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Full name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" className={`${inputCls} pl-9`} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={`${inputCls} pl-9`} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" className={`${inputCls} pl-9`} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">LinkedIn</label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="linkedin.com/in/you" className={`${inputCls} pl-9`} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Drop your PDF. We extract your skills, experience, and target role — then match jobs against you.
              </p>
              <ResumeUpload onParsed={handleResumeParsed} existingResumeUrl={resumeUrl} />

              <div className="pt-2 border-t border-gray-100 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">What roles are you searching for?</label>
                  <TagInput
                    value={targetRoles}
                    onChange={setTargetRoles}
                    placeholder="e.g. Frontend Engineer, Product Designer"
                    helperText="Add up to 5. We use these to search across all job sources."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Where do you want jobs?</label>
                  <select value={targetCountry} onChange={e => setTargetCountry(e.target.value)} className={inputCls}>
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">We search Adzuna and JSearch in this country. Remotive (remote-only) is included regardless.</p>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 text-center">You can skip and edit later in Settings.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-500">Match score threshold</label>
                  <span className="text-xs font-semibold text-gray-900">{matchThreshold}%</span>
                </div>
                <input type="range" min="0" max="100" value={matchThreshold}
                  onChange={e => setMatchThreshold(Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded appearance-none cursor-pointer accent-gray-900" />
                <p className="text-[10px] text-gray-400 mt-1.5">Jobs scoring below {matchThreshold}% against your resume are hidden. 70% is a balanced starting point.</p>
              </div>

              {parsedResume && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-700">{parsedResume.target_role}</p>
                    <p className="text-[10px] text-green-600 mt-0.5">{parsedResume.skills.length} skills · {parsedResume.years_experience}y experience</p>
                  </div>
                </div>
              )}
            </div>
          )}
          </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex gap-3 mt-4">
          {step > 1 && (
            <button onClick={() => goToStep(step - 1)}
              className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-1.5 hover:border-gray-400 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < STEPS.length ? (
            <button onClick={() => goToStep(step + 1)} disabled={step === 1 && !canProceedStep1}
              className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-1.5 hover:bg-gray-700 disabled:opacity-50 transition-colors">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleFinish} disabled={saving}
              className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-2 hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Go to dashboard"}
            </button>
          )}
        </div>

        {step === 1 && (
          <button onClick={handleSkip}
            className="w-full mt-3 text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Skip for now →
          </button>
        )}
      </div>
    </div>
  )
}
