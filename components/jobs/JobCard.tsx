"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { MatchScoreBadge } from "./MatchScoreBadge"
import { Match } from "@/types"
import { MapPin, ArrowUpRight } from "lucide-react"
import { calculateDaysAgo } from "@/lib/utils"
import { fadeUp, spring } from "@/lib/motion"
import { STATUS_LABEL, STATUS_TONE, JOB_TYPE_LABEL, JOB_TYPE_TONE, SOURCE_LABEL } from "@/lib/status"

export function JobCard({ match }: { match: Match }) {
  const prefersReduced = useReducedMotion()
  const job = match.job
  if (!job) return null

  const cardClass = "bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors flex flex-col h-full cursor-pointer"

  if (prefersReduced) {
    return <div className={cardClass}>{renderCardBody(match, job)}</div>
  }

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -3, transition: spring }}
      className={cardClass}
    >
      {renderCardBody(match, job)}
    </motion.div>
  )
}

function renderCardBody(match: Match, job: NonNullable<Match["job"]>) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <MatchScoreBadge score={match.match_score} size="sm" />
        <div className="flex items-center gap-1">
          <span className={`text-[9px] font-medium border rounded-md px-1.5 py-0.5 ${JOB_TYPE_TONE[job.job_type] ?? ""}`}>
            {JOB_TYPE_LABEL[job.job_type] ?? "Location TBD"}
          </span>
          <span className={`text-[9px] font-medium border rounded-md px-1.5 py-0.5 ${STATUS_TONE[match.status] ?? ""}`}>
            {STATUS_LABEL[match.status] ?? match.status}
          </span>
        </div>
      </div>

      <p className="text-sm font-medium text-gray-900 leading-snug mb-0.5 line-clamp-2">{job.title}</p>
      <p className="text-xs text-gray-500 mb-3">{job.company}</p>

      <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location || JOB_TYPE_LABEL[job.job_type]}</span>
        <span>{calculateDaysAgo(job.posted_date)}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {job.tags.slice(0, 3).map((tag, i) => (
          <span key={i} className="bg-gray-50 border border-gray-200 text-[10px] text-gray-500 px-2 py-0.5 rounded">{tag}</span>
        ))}
      </div>

      <div className="mt-auto pt-3 border-t border-gray-100 flex justify-between items-center">
        <span className="text-[10px] text-gray-300 uppercase tracking-wider">{SOURCE_LABEL[job.source] ?? job.source}</span>
        <Link href={`/jobs/${job.id}`} className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
          View <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </>
  )
}
