"use client"

import { useState } from "react"
import { useApplications } from "@/hooks/useApplications"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { Match, JobStatus } from "@/types"
import { Loader2, Calendar, Edit2, AlertCircle } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { STATUS_LABEL } from "@/lib/status"
import { Reveal } from "@/components/motion/Reveal"
import { Stagger, StaggerItem } from "@/components/motion/Stagger"

const STATUS_OPTS: { value: JobStatus; label: string }[] = [
  { value: "applied",   label: STATUS_LABEL.applied   },
  { value: "interview", label: STATUS_LABEL.interview },
  { value: "offer",     label: STATUS_LABEL.offer     },
  { value: "rejected",  label: STATUS_LABEL.rejected  },
]

export default function ApplicationsPage() {
  const { applications, loading, updating, error, updateApplicationStatus, saveApplicationNotes } = useApplications()
  const [activeNotesId, setActiveNotesId]   = useState<string | null>(null)
  const [notesText, setNotesText]           = useState("")

  const handleSaveNotes = async (matchId: string) => {
    const res = await saveApplicationNotes(matchId, notesText)
    if (res.success) setActiveNotesId(null)
  }

  if (loading) return <div className="flex items-center justify-center min-h-[500px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-6">
      <Reveal>
        <h1 className="text-lg font-semibold text-foreground">Applications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Jobs you&apos;ve applied to and their progress through interview, offer, or rejection.</p>
      </Reveal>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {applications.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-sm text-muted-foreground">No applications yet</p>
            <p className="text-xs text-muted-foreground mt-1">Open a job and click <strong>Mark applied</strong> to track it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  {["Role", "Score", "Applied", "Stage", "Notes"].map(h => (
                    <th key={h} className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <Stagger as="tbody" className="divide-y divide-gray-50">
                {applications.map((match: Match) => {
                  const job = match.job
                  if (!job) return null
                  const isEditing = activeNotesId === match.id
                  return (
                    <StaggerItem as="tr" key={match.id} className="align-top hover:bg-muted transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="text-sm font-medium text-foreground">{job.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.company}</p>
                      </td>
                      <td className="py-3.5 px-4"><MatchScoreBadge score={match.match_score} size="sm" /></td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {match.applied_at ? formatDate(match.applied_at) : "—"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <select value={match.status} disabled={updating}
                          onChange={(e) => updateApplicationStatus(match.id, e.target.value as JobStatus)}
                          className="bg-card border border-border text-xs text-foreground/80 rounded-md py-1 px-2 focus:outline-none focus:border-foreground cursor-pointer">
                          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)}
                              placeholder="Log interview notes, follow-ups..." rows={3}
                              className="w-full border border-border rounded-md p-2 text-base sm:text-xs text-foreground/90 placeholder:text-muted-foreground focus:outline-none focus:border-foreground" />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setActiveNotesId(null)} className="text-[10px] text-muted-foreground hover:text-foreground/90">Cancel</button>
                              <button onClick={() => handleSaveNotes(match.id)} className="bg-primary text-primary-foreground text-[10px] font-medium px-2.5 py-1 rounded-md hover:opacity-90 transition-colors">Save</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <p className="text-xs text-muted-foreground italic line-clamp-2 flex-1">{match.notes || "No notes."}</p>
                            <button onClick={() => { setActiveNotesId(match.id); setNotesText(match.notes || "") }}
                              className="text-muted-foreground/60 hover:text-foreground/90 shrink-0 mt-0.5 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </StaggerItem>
                  )
                })}
              </Stagger>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
