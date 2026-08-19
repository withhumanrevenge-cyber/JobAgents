"use client"

import Link from "next/link"
import { MatchScoreBadge } from "./MatchScoreBadge"
import { Match } from "@/types"
import { calculateDaysAgo } from "@/lib/utils"
import { ArrowUpRight } from "lucide-react"
import { STATUS_LABEL, STATUS_TONE } from "@/lib/status"

export function JobsTable({ matches }: { matches: Match[] }) {
  if (matches.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg py-14 text-center">
        <p className="text-sm text-muted-foreground">No jobs found</p>
        <p className="text-xs text-muted-foreground mt-1">Click <strong>Find new jobs</strong> in the top bar or clear your filters.</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Score</th>
              <th className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Location</th>
              <th className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Posted</th>
              <th className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {matches.map((match) => {
              const job = match.job
              if (!job) return null
              return (
                <tr key={match.id} className="hover:bg-muted transition-colors group">
                  <td className="py-3.5 px-4">
                    <p className="text-sm font-medium text-foreground group-hover:text-foreground/90 truncate max-w-[220px]">{job.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{job.company}</p>
                  </td>
                  <td className="py-3.5 px-4"><MatchScoreBadge score={match.match_score} size="sm" /></td>
                  <td className="py-3.5 px-4 text-xs text-muted-foreground">{job.location || "Remote"}</td>
                  <td className="py-3.5 px-4 text-xs text-muted-foreground">{calculateDaysAgo(job.posted_date)}</td>
                  <td className="py-3.5 px-4">
                    <span className={`text-[10px] font-medium border rounded-md px-1.5 py-0.5 ${STATUS_TONE[match.status] ?? ""}`}>
                      {STATUS_LABEL[match.status] ?? match.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link href={`/jobs/${job.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
                      View <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
