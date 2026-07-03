"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ArrowLeft } from "lucide-react"
import { TagInput } from "@/components/ui/TagInput"
import type { JobType, ExperienceLevel } from "@/types"

export default function NewPostingPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [location, setLocation] = useState("")
  const [jobType, setJobType] = useState<JobType>("onsite")
  const [experience, setExperience] = useState<ExperienceLevel>("mid")
  const [salary, setSalary] = useState("")
  const [skills, setSkills] = useState<string[]>([])
  const [description, setDescription] = useState("")

  const inputCls = "w-full border border-gray-200 rounded-md py-2.5 px-3 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors"
  const labelCls = "block text-xs text-gray-500 mb-1.5"

  const canSubmit = title.trim() && company.trim() && description.trim()

  const handleSubmit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/hire/postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, company,
          location: location || null,
          job_type: jobType,
          experience_level: experience,
          salary_range: salary || null,
          skills,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to post role.")
      router.push(`/hire/${data.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to post role.")
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/hire" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <h1 className="text-lg font-semibold text-gray-900">Post a role</h1>
      <p className="text-sm text-gray-400 mt-0.5 mb-6">We&apos;ll match candidates from the opt-in talent pool against it.</p>

      {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Role title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Frontend Engineer" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Company *</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru, India" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Salary range</label>
            <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="₹18–28 LPA" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Work type</label>
            <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)} className={inputCls}>
              <option value="onsite">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Seniority</label>
            <select value={experience} onChange={(e) => setExperience(e.target.value as ExperienceLevel)} className={inputCls}>
              <option value="entry">Entry / Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / Staff / Principal</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Required skills</label>
          <TagInput value={skills} onChange={setSkills} placeholder="e.g. React, TypeScript, Node.js" helperText="Add the key skills — these weigh heavily in matching." />
        </div>

        <div>
          <label className={labelCls}>Description *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7}
            placeholder="Responsibilities, requirements, and what a great candidate looks like…"
            className={`${inputCls} resize-y leading-relaxed`} />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Link href="/hire" className="flex-1 text-center border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-md hover:border-gray-400 transition-colors">Cancel</Link>
        <button onClick={handleSubmit} disabled={!canSubmit || saving}
          className="flex-1 bg-gray-900 text-white text-sm font-medium py-2.5 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Posting…" : "Post role"}
        </button>
      </div>
    </div>
  )
}
