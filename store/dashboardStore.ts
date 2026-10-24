import { create } from "zustand"
import { JobType, ExperienceLevel, TimeFilter } from "@/types"

// The Jobs page's status menu. "all" and "newest" show every job (newest sorts by posting
// date); the other two pick matched or below threshold. Applications have their own page.
export type StatusFilter = "all" | "newest" | "reviewed" | "skipped"

interface DashboardState {
  searchQuery: string
  statusFilter: StatusFilter
  sourceFilter: string
  jobTypeFilter: JobType | "all"
  countryFilter: string
  regionFilter: string
  experienceFilter: ExperienceLevel | "all"
  timeFilter: TimeFilter
  selectedJobId: string | null
  syncing: boolean
  refreshKey: number
  sidebarOpen: boolean

  setSearchQuery: (query: string) => void
  setStatusFilter: (status: StatusFilter) => void
  setSourceFilter: (source: string) => void
  setJobTypeFilter: (type: JobType | "all") => void
  setCountryFilter: (country: string) => void
  setRegionFilter: (region: string) => void
  setExperienceFilter: (level: ExperienceLevel | "all") => void
  setTimeFilter: (when: TimeFilter) => void
  setSelectedJobId: (id: string | null) => void
  setSyncing: (syncing: boolean) => void
  triggerRefresh: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
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
  sidebarOpen: false,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
  setJobTypeFilter: (jobTypeFilter) => set({ jobTypeFilter }),
  setCountryFilter: (countryFilter) => set({ countryFilter, regionFilter: "all" }),
  setRegionFilter: (regionFilter) => set({ regionFilter }),
  setExperienceFilter: (experienceFilter) => set({ experienceFilter }),
  setTimeFilter: (timeFilter) => set({ timeFilter }),
  setSelectedJobId: (selectedJobId) => set({ selectedJobId }),
  setSyncing: (syncing) => set({ syncing }),
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  resetFilters: () => set({ searchQuery: "", statusFilter: "all", sourceFilter: "all", jobTypeFilter: "all", countryFilter: "all", regionFilter: "all", experienceFilter: "all", timeFilter: "all" }),
}))
