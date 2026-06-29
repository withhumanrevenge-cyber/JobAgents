import { JobStatus, JobType, JobSource, ExperienceLevel, TimeFilter } from "@/types"

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending:   "Not scored",
  reviewed:  "Matched",
  applied:   "Applied",
  skipped:   "Below threshold",
  interview: "Interview",
  offer:     "Offer",
  rejected:  "Rejected",
}

export const STATUS_TONE: Record<JobStatus, string> = {
  pending:   "bg-gray-50 text-gray-500 border-gray-200",
  reviewed:  "bg-blue-50 text-blue-700 border-blue-200",
  applied:   "bg-green-50 text-green-700 border-green-200",
  skipped:   "bg-gray-50 text-gray-400 border-gray-100",
  interview: "bg-purple-50 text-purple-700 border-purple-200",
  offer:     "bg-amber-50 text-amber-700 border-amber-200",
  rejected:  "bg-red-50 text-red-700 border-red-200",
}

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  remote:  "Remote",
  hybrid:  "Hybrid",
  onsite:  "On-site",
  unknown: "Location TBD",
}

export const JOB_TYPE_TONE: Record<JobType, string> = {
  remote:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  hybrid:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  onsite:  "bg-slate-50 text-slate-700 border-slate-200",
  unknown: "bg-gray-50 text-gray-400 border-gray-200",
}

export const SOURCE_LABEL: Record<JobSource, string> = {
  remotive: "Remotive",
  adzuna:   "Adzuna",
  jsearch:  "JSearch",
}

export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  entry:   "Entry / Junior",
  mid:     "Mid-level",
  senior:  "Senior",
  lead:    "Lead / Staff / Principal",
  unknown: "Level unclear",
}

export const TIME_LABEL: Record<TimeFilter, string> = {
  "24h": "Last 24 hours",
  "7d":  "Last 7 days",
  "30d": "Last 30 days",
}

export const TIME_THRESHOLD_MS: Record<TimeFilter, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
}
