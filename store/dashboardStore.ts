import { create } from "zustand"
import { JobStatus, JobType, ExperienceLevel, TimeFilter } from "@/types"

interface DashboardState {
  searchQuery: string
  statusFilter: JobStatus | "all"
  sourceFilter: string
  jobTypeFilter: JobType | "all"
  countryFilter: string
  regionFilter: string
  experienceFilter: ExperienceLevel | "all"
  timeFilter: TimeFilter
  selectedJobId: string | null
  syncing: boolean
  refreshKey: number

  setSearchQuery: (query: string) => void
  setStatusFilter: (status: JobStatus | "all") => void
  setSourceFilter: (source: string) => void
  setJobTypeFilter: (type: JobType | "all") => void
  setCountryFilter: (country: string) => void
  setRegionFilter: (region: string) => void
  setExperienceFilter: (level: ExperienceLevel | "all") => void
  setTimeFilter: (when: TimeFilter) => void
  setSelectedJobId: (id: string | null) => void
  setSyncing: (syncing: boolean) => void
  triggerRefresh: () => void
  resetFilters: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  searchQuery: "",
  statusFilter: "all",
  sourceFilter: "all",
  jobTypeFilter: "all",
  countryFilter: "all",
  regionFilter: "all",
  experienceFilter: "all",
  timeFilter: "all",
  selectedJobId: null,
  syncing: false,
  refreshKey: 0,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
  setJobTypeFilter: (jobTypeFilter) => set({ jobTypeFilter }),
  // Changing the country wipes the region — keeping a stale region from a previous country makes no sense.
  setCountryFilter: (countryFilter) => set({ countryFilter, regionFilter: "all" }),
  setRegionFilter: (regionFilter) => set({ regionFilter }),
  setExperienceFilter: (experienceFilter) => set({ experienceFilter }),
  setTimeFilter: (timeFilter) => set({ timeFilter }),
  setSelectedJobId: (selectedJobId) => set({ selectedJobId }),
  setSyncing: (syncing) => set({ syncing }),
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
  resetFilters: () => set({ searchQuery: "", statusFilter: "all", sourceFilter: "all", jobTypeFilter: "all", countryFilter: "all", regionFilter: "all", experienceFilter: "all", timeFilter: "all" }),
}))
