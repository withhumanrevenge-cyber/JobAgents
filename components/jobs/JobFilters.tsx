"use client"

import { useMemo } from "react"
import { useDashboardStore } from "@/store/dashboardStore"
import { Search, RotateCcw, MapPin, GraduationCap, Clock } from "lucide-react"
import { JobStatus, JobType, ExperienceLevel, TimeFilter, Match } from "@/types"
import { STATUS_LABEL, JOB_TYPE_LABEL, SOURCE_LABEL, EXPERIENCE_LABEL, TIME_LABEL } from "@/lib/status"

const TYPE_TABS: { value: JobType | "all"; label: string }[] = [
  { value: "all",    label: "All" },
  { value: "remote", label: JOB_TYPE_LABEL.remote },
  { value: "hybrid", label: JOB_TYPE_LABEL.hybrid },
  { value: "onsite", label: JOB_TYPE_LABEL.onsite },
]

interface JobFiltersProps {
  showStatusFilter?: boolean
  matches?: Match[]
}

export function JobFilters({ showStatusFilter = true, matches = [] }: JobFiltersProps) {
  const { searchQuery, statusFilter, sourceFilter, jobTypeFilter, countryFilter, regionFilter, experienceFilter, timeFilter,
          setSearchQuery, setStatusFilter, setSourceFilter, setJobTypeFilter, setCountryFilter, setRegionFilter, setExperienceFilter, setTimeFilter, resetFilters } = useDashboardStore()

  const countries = useMemo(() => {
    const set = new Set<string>()
    matches.forEach((m) => { if (m.job?.country) set.add(m.job.country) })
    return Array.from(set).sort()
  }, [matches])

  const regions = useMemo(() => {
    if (countryFilter === "all") return []
    const set = new Set<string>()
    matches.forEach((m) => {
      if (m.job?.country === countryFilter && m.job?.region) set.add(m.job.region)
    })
    return Array.from(set).sort()
  }, [matches, countryFilter])

  const selectCls = "bg-white border border-gray-200 text-base sm:text-sm text-gray-600 rounded-md py-1.5 px-3 focus:outline-none focus:border-gray-900 cursor-pointer hover:border-gray-400 transition-colors"

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-white border border-gray-200 rounded-md p-1 w-fit">
        {TYPE_TABS.map((t) => (
          <button key={t.value} onClick={() => setJobTypeFilter(t.value)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              jobTypeFilter === t.value ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:flex-wrap gap-2 items-stretch md:items-center">
        <div className="relative flex-1 w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search jobs..."
            className="w-full bg-white border border-gray-200 rounded-md py-1.5 pl-9 pr-3 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors" />
        </div>

        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
          {countries.length > 0 && (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                className={`${selectCls} pl-7`}>
                <option value="all">All countries</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {regions.length > 0 && (
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className={selectCls}>
              <option value="all">All regions</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <div className="relative">
            <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            <select value={experienceFilter} onChange={e => setExperienceFilter(e.target.value as ExperienceLevel | "all")} className={`${selectCls} pl-7`}>
              <option value="all">All levels</option>
              <option value="entry">{EXPERIENCE_LABEL.entry}</option>
              <option value="mid">{EXPERIENCE_LABEL.mid}</option>
              <option value="senior">{EXPERIENCE_LABEL.senior}</option>
              <option value="lead">{EXPERIENCE_LABEL.lead}</option>
              <option value="unknown">{EXPERIENCE_LABEL.unknown}</option>
            </select>
          </div>

          <div className="relative">
            <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)} className={`${selectCls} pl-7`}>
              <option value="24h">{TIME_LABEL["24h"]}</option>
              <option value="7d">{TIME_LABEL["7d"]}</option>
              <option value="30d">{TIME_LABEL["30d"]}</option>
            </select>
          </div>

          {showStatusFilter && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as JobStatus | "all")} className={selectCls}>
              <option value="all">All statuses</option>
              <option value="reviewed">{STATUS_LABEL.reviewed}</option>
              <option value="pending">{STATUS_LABEL.pending}</option>
              <option value="applied">{STATUS_LABEL.applied}</option>
              <option value="interview">{STATUS_LABEL.interview}</option>
              <option value="offer">{STATUS_LABEL.offer}</option>
              <option value="skipped">{STATUS_LABEL.skipped}</option>
            </select>
          )}

          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className={selectCls}>
            <option value="all">All sources</option>
            <option value="remotive">{SOURCE_LABEL.remotive}</option>
            <option value="adzuna">{SOURCE_LABEL.adzuna}</option>
            <option value="jsearch">{SOURCE_LABEL.jsearch}</option>
          </select>

          <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 px-2 py-1.5 transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>
    </div>
  )
}
