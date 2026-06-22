"use client"

import { useState } from "react"
import { useJobs } from "@/hooks/useJobs"
import { JobFilters } from "@/components/jobs/JobFilters"
import { JobsTable } from "@/components/jobs/JobsTable"
import { JobCard } from "@/components/jobs/JobCard"
import { useDashboardStore } from "@/store/dashboardStore"
import { Loader2, LayoutGrid, List } from "lucide-react"
import { Stagger } from "@/components/motion/Stagger"
import { TIME_THRESHOLD_MS } from "@/lib/status"

export default function JobsPage() {
  const { allJobRows, loading } = useJobs()
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const { searchQuery, statusFilter, sourceFilter, jobTypeFilter, countryFilter, regionFilter, experienceFilter, timeFilter } = useDashboardStore()

  // Compute the time cutoff once per render — used by the postedAfter check below.
  const timeThreshold = TIME_THRESHOLD_MS[timeFilter]
  const cutoff = timeThreshold === null ? null : Date.now() - timeThreshold

  const filteredMatches = allJobRows
    .filter((match) => {
      const job = match.job
      if (!job) return false
      const q = `${job.title} ${job.company} ${job.tags.join(" ")}`.toLowerCase()
      const postedAfter = cutoff === null || (job.posted_date ? new Date(job.posted_date).getTime() >= cutoff : false)
      return (searchQuery === "" || q.includes(searchQuery.toLowerCase()))
        && (statusFilter === "all" || match.status === statusFilter)
        && (sourceFilter === "all" || job.source === sourceFilter)
        && (jobTypeFilter === "all" || job.job_type === jobTypeFilter)
        && (countryFilter === "all" || job.country === countryFilter)
        && (regionFilter === "all" || job.region === regionFilter)
        && (experienceFilter === "all" || job.experience_level === experienceFilter)
        && postedAfter
    })
    .sort((a, b) => b.match_score - a.match_score)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filteredMatches.length} results</p>
        </div>
        <div className="flex gap-1 border border-gray-200 rounded-md p-0.5">
          <button onClick={() => setViewMode("table")}
            className={`p-1.5 rounded transition-colors ${viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-900"}`}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-900"}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      <JobFilters matches={allJobRows} />

      {viewMode === "table" ? (
        <JobsTable matches={filteredMatches} />
      ) : filteredMatches.length === 0 ? (
        <div className="text-center py-14">
          <p className="text-sm text-gray-500">No jobs found</p>
          <p className="text-xs text-gray-400 mt-1">Try searching for new jobs or clearing your filters.</p>
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMatches.map((match) => <JobCard key={match.id} match={match} />)}
        </Stagger>
      )}
    </div>
  )
}
