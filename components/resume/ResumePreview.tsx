"use client"

import { useState, useEffect } from "react"
import { PDFDownloadLink } from "@react-pdf/renderer"
import { ResumeTemplate } from "./ResumeTemplate"
import { ResumeData } from "@/types"
import { Loader2, Download, FileText, Check, Edit3 } from "lucide-react"

interface ResumePreviewProps {
  initialData: ResumeData
  onSave?: (updatedData: ResumeData) => Promise<void>
}

export function ResumePreview({ initialData, onSave }: ResumePreviewProps) {
  const [isClient, setIsClient] = useState(false)
  const [data, setData]         = useState<ResumeData>(initialData)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { Promise.resolve().then(() => setIsClient(true)) }, [])

  const handleFieldChange = <K extends keyof ResumeData>(field: K, value: ResumeData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNestedFieldChange = <S extends "experience" | "education" | "projects">(
    section: S, index: number, field: string, value: string | string[]
  ) => {
    setData((prev) => {
      const list = [...prev[section]] as Record<string, unknown>[]
      list[index] = { ...list[index], [field]: value }
      return { ...prev, [section]: list } as unknown as ResumeData
    })
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try { await onSave(data); setIsEditing(false) }
    catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (!isClient) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
        <p className="text-sm text-gray-500">Loading PDF builder...</p>
      </div>
    )
  }

  const inputCls = "w-full border border-gray-200 rounded-md py-1.5 px-2.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900 transition-colors"

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-medium text-gray-900">Tailored resume</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsEditing(!isEditing)}
            className="border border-gray-200 text-xs text-gray-600 px-3 py-1.5 rounded-md hover:border-gray-400 flex items-center gap-1.5 transition-colors">
            <Edit3 className="w-3 h-3" />
            {isEditing ? "Preview" : "Edit"}
          </button>
          <PDFDownloadLink
            document={<ResumeTemplate data={data} />}
            fileName={`${data.name.replace(/\s+/g, "_")}_Resume.pdf`}
            className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-gray-700 flex items-center gap-1.5 transition-colors">
            {({ loading }) => (
              <>{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {loading ? "Compiling..." : "Download"}</>
            )}
          </PDFDownloadLink>
        </div>
      </div>

      {isEditing ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs font-medium text-gray-700">Edit resume details</p>
            {onSave && (
              <button onClick={handleSave} disabled={saving}
                className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] text-gray-400 uppercase mb-1">Name</label>
              <input type="text" value={data.name} onChange={e => handleFieldChange("name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 uppercase mb-1">Email</label>
              <input type="email" value={data.email} onChange={e => handleFieldChange("email", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-[9px] text-gray-400 uppercase mb-1">Summary</label>
            <textarea rows={3} value={data.summary} onChange={e => handleFieldChange("summary", e.target.value)} className={inputCls} />
          </div>

          <hr className="border-gray-100" />
          <p className="text-[10px] text-gray-500 font-medium">Experience</p>
          {data.experience.map((exp, idx) => (
            <div key={idx} className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(["title", "company", "dates"] as const).map(f => (
                  <div key={f}>
                    <label className="block text-[8px] text-gray-400 uppercase mb-0.5 capitalize">{f}</label>
                    <input type="text" value={exp[f]} onChange={e => handleNestedFieldChange("experience", idx, f, e.target.value)} className={inputCls} />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[8px] text-gray-400 uppercase mb-1">Bullets</label>
                {exp.bullets.map((bullet, bIdx) => (
                  <input key={bIdx} type="text" value={bullet}
                    onChange={e => { const b = [...exp.bullets]; b[bIdx] = e.target.value; handleNestedFieldChange("experience", idx, "bullets", b) }}
                    className={`${inputCls} mb-1.5`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl mx-auto space-y-5 text-gray-700">
          <div className="border-b border-gray-100 pb-4">
            <h2 className="text-xl font-bold text-gray-900">{data.name}</h2>
            <div className="flex gap-4 text-xs text-gray-500 mt-1">
              <span>{data.email}</span><span>•</span><span>{data.phone}</span>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Summary</p>
            <p className="text-xs text-gray-600 leading-relaxed">{data.summary}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s, i) => <span key={i} className="bg-gray-50 border border-gray-200 text-[10px] text-gray-600 px-2 py-0.5 rounded">{s}</span>)}
            </div>
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mb-3">Experience</p>
            {data.experience.map((exp, idx) => (
              <div key={idx} className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs font-medium text-gray-900">
                  <span>{exp.title}</span><span className="text-gray-400 font-normal">{exp.dates}</span>
                </div>
                <div className="text-xs italic text-gray-500">{exp.company}</div>
                <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5 pl-1">
                  {exp.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mb-2">Education</p>
            {data.education.map((edu, idx) => (
              <div key={idx} className="flex justify-between text-xs text-gray-600 mb-1.5">
                <div><span className="font-medium text-gray-900">{edu.degree}</span><span className="text-gray-400 italic block">{edu.school}</span></div>
                <span className="text-gray-400">{edu.year}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
