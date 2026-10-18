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

// Matched vs below threshold, judged by the score against the user's CURRENT threshold. The
// status saved at scoring time used whatever threshold applied then, so a later threshold
// change (or a job scored by older code) would otherwise leave jobs in the wrong group.
// Tracked statuses (applied, interview, offer, rejected) and unscored jobs are kept as saved.
export function effectiveStatus(status: JobStatus, score: number, threshold: number): JobStatus {
  if ((status === "reviewed" || status === "skipped") && score >= 0) {
    return score >= threshold ? "reviewed" : "skipped"
  }
  return status
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
  adzuna:     "Adzuna",
  greenhouse: "Greenhouse",
  lever:      "Lever",
  ashby:      "Ashby",
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
  "all": "All time",
}

export const TIME_THRESHOLD_MS: Record<TimeFilter, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": Number.POSITIVE_INFINITY,
}
