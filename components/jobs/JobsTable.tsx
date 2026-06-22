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
      <div className="bg-white border border-gray-200 rounded-lg py-14 text-center">
        <p className="text-sm text-gray-500">No jobs found</p>
        <p className="text-xs text-gray-400 mt-1">Click <strong>Find new jobs</strong> in the top bar or clear your filters.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Role</th>
              <th className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Score</th>
              <th className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Location</th>
              <th className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Posted</th>
              <th className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-right text-[10px] font-medium text-gray-400 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {matches.map((match) => {
              const job = match.job
              if (!job) return null
              return (
                <tr key={match.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="py-3.5 px-4">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700 truncate max-w-[220px]">{job.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{job.company}</p>
                  </td>
                  <td className="py-3.5 px-4"><MatchScoreBadge score={match.match_score} size="sm" /></td>
                  <td className="py-3.5 px-4 text-xs text-gray-500">{job.location || "Remote"}</td>
                  <td className="py-3.5 px-4 text-xs text-gray-400">{calculateDaysAgo(job.posted_date)}</td>
                  <td className="py-3.5 px-4">
                    <span className={`text-[10px] font-medium border rounded-md px-1.5 py-0.5 ${STATUS_TONE[match.status] ?? ""}`}>
                      {STATUS_LABEL[match.status] ?? match.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link href={`/jobs/${job.id}`} className="text-xs text-gray-400 hover:text-gray-900 inline-flex items-center gap-1 transition-colors">
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
