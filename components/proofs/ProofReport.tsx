import { Quote, AlertTriangle } from "lucide-react"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import type { ProofReport as Report } from "@/types"

// One report, three readers: the candidate, a recruiter, and anyone with a shared link.
// Evidence quotes are checked server-side to be verbatim from the candidate's answers.
export function ProofReport({ report, compact = false }: { report: Report; compact?: boolean }) {
  const { integrity } = report
  const flagged = integrity.pasted > 0 || integrity.late > 0
  return (
    <div className="space-y-4">
      {report.summary && <p className="text-sm text-foreground/90 leading-relaxed">{report.summary}</p>}

      <div className="space-y-2">
        {report.skills.map((s, i) => (
          <div key={i} className="border border-border rounded-md p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground">{s.skill}</p>
              <MatchScoreBadge score={s.score} size="sm" />
            </div>
            {s.note && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.note}</p>}
            {!compact && s.evidence.length > 0 && (
              <div className="mt-2 space-y-1">
                {s.evidence.map((q, j) => (
                  <p key={j} className="flex gap-1.5 text-xs text-foreground/80 italic leading-relaxed">
                    <Quote className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />{q}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!compact && (report.strengths.length > 0 || report.gaps.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] text-green-700 font-medium uppercase mb-1">Strengths</p>
            <ul className="text-xs text-foreground/80 space-y-1 list-disc pl-4">
              {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-[9px] text-amber-700 font-medium uppercase mb-1">To work on</p>
            <ul className="text-xs text-foreground/80 space-y-1 list-disc pl-4">
              {report.gaps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}

      <p className={`flex items-center gap-1.5 text-[11px] ${flagged ? "text-amber-700" : "text-muted-foreground"}`}>
        {flagged && <AlertTriangle className="w-3 h-3" />}
        {integrity.answered} answers
        {integrity.pasted > 0 && ` · ${integrity.pasted} pasted`}
        {integrity.late > 0 && ` · ${integrity.late} over time`}
        {" · AI-assessed, not a certification"}
      </p>
    </div>
  )
}
