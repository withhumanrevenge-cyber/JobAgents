"use client"

import React, { useState, useEffect, Suspense } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useProfile } from "@/hooks/useProfile"
import { Loader2, Check, AlertTriangle, Mail } from "lucide-react"
import { calculateDaysAgo } from "@/lib/utils"
import { ResumeUpload } from "@/components/resume/ResumeUpload"
import { TagInput } from "@/components/ui/TagInput"
import { BillingPanel } from "@/components/billing/BillingPanel"
import { ParsedResume } from "@/types"
import { Reveal } from "@/components/motion/Reveal"
import { spring } from "@/lib/motion"
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries"

export default function SettingsPage() {
  const { profile, loading, saving, updateProfile } = useProfile()

  const [fullName, setFullName]     = useState("")
  const [email, setEmail]           = useState("")
  const [phone, setPhone]           = useState("")
  const [linkedinUrl, setLinkedinUrl]       = useState("")
  const [targetRoles, setTargetRoles]       = useState<string[]>([])
  const [targetCountry, setTargetCountry]   = useState<string>(DEFAULT_COUNTRY)
  const [matchThreshold, setMatchThreshold] = useState(70)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [sendingTest, setSendingTest]       = useState(false)

  const [resumeUrl, setResumeUrl]           = useState<string | null>(null)
  const [parsedResume, setParsedResume]     = useState<ParsedResume | null>(null)
  const [parsedAt, setParsedAt]             = useState<string | null>(null)
  const [feedback, setFeedback]             = useState<{ type: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    if (profile) {
      Promise.resolve().then(() => {
        setFullName(profile.full_name || "")
        setEmail(profile.email || "")
        setPhone(profile.phone || "")
        setLinkedinUrl(profile.linkedin_url || "")
        setTargetRoles(Array.isArray(profile.target_roles) ? profile.target_roles : [])
        setTargetCountry(profile.target_country || DEFAULT_COUNTRY)
        setMatchThreshold(profile.match_threshold || 70)
        setEmailNotifications(profile.email_notifications ?? true)
        setResumeUrl(profile.base_resume_url || null)
        setParsedResume(profile.parsed_resume || null)
        setParsedAt(profile.resume_parsed_at || null)
      })
    }
  }, [profile])

  const handleResumeParsed = async (resume: ParsedResume, url: string) => {
    setParsedResume(resume); setResumeUrl(url); setParsedAt(new Date().toISOString())
    await updateProfile({ base_resume_url: url })
    setFeedback({ type: "success", message: "Resume parsed and saved. Find new jobs to re-score with this resume." })
  }

  const handleSendTest = async () => {
    if (!email) { setFeedback({ type: "error", message: "Add an email address and save first." }); return }
    setSendingTest(true); setFeedback(null)
    try {
      const res = await fetch("/api/notifications/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "test" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send.")
      setFeedback({ type: "success", message: `Test email sent to ${data.to}. Check your inbox.` })
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Failed to send test." })
    } finally { setSendingTest(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFeedback(null)
    const res = await updateProfile({ full_name: fullName, email, phone, linkedin_url: linkedinUrl, target_roles: targetRoles, target_country: targetCountry, match_threshold: matchThreshold, email_notifications: emailNotifications })
    setFeedback(res.success
      ? { type: "success", message: "Settings saved." }
      : { type: "error",   message: res.error || "Failed to save." }
    )
  }

  if (loading) return <div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>

  const inputCls = "w-full border border-gray-200 rounded-md py-2 px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors"
  const labelCls = "block text-xs text-gray-500 mb-1.5"

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
      <Reveal>
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Profile, resume, and matching preferences.</p>
      </Reveal>

      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback.message}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
            className={`p-3 rounded-md text-xs border flex items-start gap-2 ${feedback.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            {feedback.type === "success" ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            {feedback.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-5">
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            <p className="text-sm font-medium text-gray-900">Profile</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full name</label>
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
                <p className="text-[10px] text-gray-400 mt-1">Used on tailored resumes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>LinkedIn</label>
                <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
              </div>
            </div>

            <hr className="border-gray-100" />
            <p className="text-sm font-medium text-gray-900">Matching</p>

            <div>
              <label className={labelCls}>Target roles</label>
              <TagInput
                value={targetRoles}
                onChange={setTargetRoles}
                placeholder="e.g. Frontend Engineer, Product Designer"
                helperText="Used as search queries across all job sources. Differs from what your resume shows you are — useful for career switchers."
              />
            </div>

            <div>
              <label className={labelCls}>Where you want jobs</label>
              <select value={targetCountry} onChange={e => setTargetCountry(e.target.value)} className={inputCls}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Adzuna and JSearch are searched in this country. Remotive (remote-only) is always included.</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className={labelCls}>Match score threshold</label>
                <span className="text-xs font-medium text-gray-900">{matchThreshold}%</span>
              </div>
              <input type="range" min="0" max="100" value={matchThreshold}
                onChange={e => setMatchThreshold(Number(e.target.value))}
                className="w-full h-1 bg-gray-200 rounded appearance-none cursor-pointer accent-gray-900" />
              <p className="text-[10px] text-gray-400 mt-1.5">Jobs scoring below this against your resume are hidden from your feed.</p>
            </div>

            <hr className="border-gray-100" />
            <p className="text-sm font-medium text-gray-900">Notifications</p>

            <div className="bg-gray-50 border border-gray-200 p-3 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email digest</p>
                    <p className="text-xs text-gray-400 mt-0.5">Get an email when new matches land above your threshold.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" checked={emailNotifications} onChange={e => setEmailNotifications(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-900 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              <button type="button" onClick={handleSendTest} disabled={sendingTest || !email}
                className="text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-md hover:border-gray-400 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                {sendingTest ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                {sendingTest ? "Sending..." : "Send test email"}
              </button>
            </div>

            <button type="submit" disabled={saving}
              className="bg-gray-900 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save changes
            </button>
          </form>
        </div>

        <div className="space-y-5">
          <Suspense fallback={null}>
            <BillingPanel />
          </Suspense>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Resume</p>
              <p className="text-xs text-gray-400 mt-0.5">Used for job scoring and tailoring.</p>
            </div>

            {parsedResume && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 space-y-1">
                <p className="text-xs font-medium text-green-700 flex items-center gap-1.5">
                  <Check className="w-3 h-3" /> Resume parsed
                  {parsedAt && <span className="text-[10px] font-normal text-green-600">· {calculateDaysAgo(parsedAt).toLowerCase()}</span>}
                </p>
                <p className="text-[10px] text-green-600">{parsedResume.target_role} · {parsedResume.years_experience}y · {parsedResume.skills.length} skills</p>
                {resumeUrl && <a href={resumeUrl} target="_blank" rel="noreferrer" className="text-[10px] text-gray-500 hover:text-gray-900">View PDF →</a>}
              </div>
            )}

            <ResumeUpload onParsed={handleResumeParsed} existingResumeUrl={resumeUrl} />
          </div>
        </div>
      </div>
    </div>
  )
}
