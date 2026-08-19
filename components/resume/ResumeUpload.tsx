"use client"

import React, { useState, useRef } from "react"
import { Upload, FileText, CheckCircle, Loader2, AlertTriangle } from "lucide-react"
import { ParsedResume } from "@/types"
import { openStoredResume } from "@/lib/resume"

interface ResumeUploadProps {
  onParsed?: (resume: ParsedResume, url: string) => void
  compact?: boolean
  existingResumeUrl?: string | null
}

export function ResumeUpload({ onParsed, compact = false, existingResumeUrl }: ResumeUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsed, setParsed]     = useState<ParsedResume | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(existingResumeUrl || null)
  const [error, setError]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") { setError("Only PDF files are supported."); return }
    if (file.size > 10 * 1024 * 1024)   { setError("File must be under 10MB."); return }

    setUploading(true); setError(null); setParsed(null)
    const formData = new FormData()
    formData.append("resume", file)
    try {
      const res  = await fetch("/api/resume/parse", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to parse resume.")
      setParsed(data.parsed_resume)
      setResumeUrl(data.resume_url)
      onParsed?.(data.parsed_resume, data.resume_url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally { setUploading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  if (compact && parsed) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-md p-3">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-green-700">Resume parsed</p>
          <p className="text-[10px] text-green-600 truncate">
            {parsed.name} · {parsed.target_role} · {parsed.years_experience}y · {parsed.skills.length} skills
          </p>
        </div>
        <button onClick={() => inputRef.current?.click()} className="text-[10px] text-green-700 hover:underline shrink-0">Replace</button>
        <input ref={inputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragging  ? "border-border bg-muted" :
          uploading ? "border-border bg-muted cursor-not-allowed" :
          parsed    ? "border-green-300 bg-green-50" :
          "border-border bg-card hover:border-foreground/40"
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <div className="text-center">
              <p className="text-sm text-foreground/90">Parsing resume...</p>
              <p className="text-xs text-muted-foreground mt-0.5">Extracting skills, experience &amp; education</p>
            </div>
          </>
        ) : parsed ? (
          <>
            <CheckCircle className="w-6 h-6 text-green-500" />
            <div className="text-center">
              <p className="text-sm text-foreground/90">Resume parsed</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm text-foreground/90">Drop your resume or <span className="text-foreground underline underline-offset-2">browse</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">PDF only · Max 10MB</p>
            </div>
          </>
        )}
        <input ref={inputRef} type="file" accept="application/pdf" onChange={handleFileChange} disabled={uploading} className="hidden" />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {parsed && (
        <div className="bg-card border border-border rounded-md p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-foreground/90">Parsed data</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Target role</p>
              <p className="text-xs text-foreground">{parsed.target_role || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Experience</p>
              <p className="text-xs text-foreground">{parsed.years_experience} years</p>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase mb-1">Skills ({parsed.skills.length})</p>
            <div className="flex flex-wrap gap-1">
              {parsed.skills.slice(0, 12).map((skill, idx) => (
                <span key={idx} className="bg-muted border border-border text-[9px] text-foreground/80 px-2 py-0.5 rounded">{skill}</span>
              ))}
              {parsed.skills.length > 12 && <span className="text-[9px] text-muted-foreground">+{parsed.skills.length - 12}</span>}
            </div>
          </div>
          {resumeUrl && (
            <button type="button"
              onClick={async () => { const r = await openStoredResume(); if (!r.ok) setError(r.error || "Could not open resume.") }}
              className="text-[10px] text-muted-foreground hover:text-foreground">
              View PDF →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
