import { createServiceClient } from "@/lib/supabase/server"
import { Job, JobSource, JobType, ExperienceLevel } from "@/types"
import { ADZUNA_SUPPORTED, COUNTRY_NAME, DEFAULT_COUNTRY } from "@/lib/countries"
import { fetchAtsJobs } from "@/lib/agents/atsScraper"

export const DEFAULT_QUERIES = [
  "software engineer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "data analyst",
  "product manager",
  "devops engineer",
  "ui ux designer",
]

const RECENT_DAYS = 180

function isRecent(job: Partial<Job>): boolean {
  if (!job.posted_date) return true
  const t = new Date(job.posted_date).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t <= RECENT_DAYS * 24 * 60 * 60 * 1000
}

function detectJobType(location: string | null, description: string | null, isRemoteFlag?: boolean): JobType {
  const haystack = `${location || ""} ${description?.slice(0, 500) || ""}`.toLowerCase()
  if (haystack.includes("hybrid")) return "hybrid"
  if (isRemoteFlag || haystack.includes("remote") || haystack.includes("worldwide") || haystack.includes("anywhere")) return "remote"
  if (haystack.includes("on-site") || haystack.includes("onsite") || haystack.includes("in-office") || haystack.includes("in office")) return "onsite"
  return isRemoteFlag ? "remote" : "unknown"
}

function detectExperienceLevel(title: string): ExperienceLevel {
  const t = title.toLowerCase()
  if (/\b(staff|principal|architect|distinguished|director|vp|head of|tech lead|engineering manager|founding)\b/.test(t)) return "lead"
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior"
  if (/\b(junior|jr\.?|entry[- ]?level|intern|internship|associate|graduate|new grad)\b/.test(t)) return "entry"
  if (/\bengineer\s+i\b/.test(t)) return "entry"
  if (/\bengineer\s+iii\b|\bengineer\s+iv\b/.test(t)) return "senior"
  return "mid"
}

interface AdzunaJob {
  id: string
  title?: string
  company?: { display_name?: string }
  location?: { display_name?: string; area?: string[] }
  redirect_url?: string
  description?: string
  salary_min?: number
  salary_max?: number
  category?: { label?: string }
  created?: string
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<Response> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return res
  } catch (err: unknown) {
    if (retries <= 0) throw err
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`Fetch to ${url} failed. Retrying in ${delay}ms... Error: ${errMsg}`)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return fetchWithRetry(url, options, retries - 1, delay * 2)
  }
}

export async function fetchAdzunaJobs(query = "software engineer", countryCode = DEFAULT_COUNTRY, pageCount = 5): Promise<Partial<Job>[]> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  if (!appId || !appKey || appId.includes("your-adzuna") || appKey.includes("your-adzuna")) {
    console.warn("Adzuna API credentials missing. Skipping Adzuna fetch.")
    return []
  }

  const cc = countryCode.toUpperCase()
  if (!ADZUNA_SUPPORTED.has(cc)) {
    console.warn(`Adzuna doesn't support country "${cc}". Skipping Adzuna fetch for that country.`)
    return []
  }

  try {
    const encodedQuery = encodeURIComponent(query)
    const pages = Array.from({ length: Math.max(1, Math.min(pageCount, 5)) }, (_, i) => i + 1)
    const pageResults = await Promise.all(
      pages.map(async (page) => {
        try {
          const url = `https://api.adzuna.com/v1/api/jobs/${cc.toLowerCase()}/search/${page}?app_id=${appId}&app_key=${appKey}&title_only=${encodedQuery}&results_per_page=50`
          const res = await fetchWithRetry(url, { next: { revalidate: 0 } })
          const data = await res.json()
          return (data.results || []) as AdzunaJob[]
        } catch {
          return [] as AdzunaJob[]
        }
      })
    )
    const results: AdzunaJob[] = pageResults.flat()

    return results.map((job: AdzunaJob) => {
      const tags: string[] = []
      if (job.category?.label) tags.push(job.category.label)

      const salaryMin = job.salary_min ? `$${Math.round(job.salary_min / 1000)}k` : ""
      const salaryMax = job.salary_max ? `$${Math.round(job.salary_max / 1000)}k` : ""
      const salary = salaryMin && salaryMax ? `${salaryMin} - ${salaryMax}` : salaryMin || null

      const adzLoc = job.location?.display_name || ""
      const jobType = detectJobType(adzLoc, job.description || null)
      const area = job.location?.area ?? []
      const country = COUNTRY_NAME[cc] || area[0] || "Unknown"
      const region = area[1] || null
      const title = job.title || "Untitled role"
      return {
        title,
        company: job.company?.display_name || "Unknown Company",
        location: adzLoc || null,
        country,
        region,
        remote: jobType === "remote",
        job_type: jobType,
        experience_level: detectExperienceLevel(title),
        url: job.redirect_url || "https://adzuna.com",
        description: job.description || "",
        salary_range: salary,
        tags,
        posted_date: job.created ? new Date(job.created).toISOString() : new Date().toISOString(),
        source: "adzuna" as JobSource,
        source_id: String(job.id),
      }
    })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("Failed to fetch from Adzuna:", errMsg)
    return []
  }
}

export async function syncAllJobs(
  queries?: string | string[],
  countries?: string | string[],
  opts?: { sources?: JobSource[]; adzunaPages?: number },
): Promise<{ fetched: number; new: number; duplicates: number }> {
  const sources = opts?.sources ?? ["adzuna", "greenhouse", "lever", "ashby"]
  const adzunaPages = opts?.adzunaPages ?? 5
  const useAdzuna = sources.includes("adzuna")
  const useAts    = sources.includes("greenhouse") || sources.includes("lever") || sources.includes("ashby")

  const roleQueries: (string | undefined)[] = Array.isArray(queries)
    ? (queries.length > 0 ? queries : [undefined])
    : [queries]

  const countryCodes: string[] = Array.isArray(countries)
    ? (countries.length > 0 ? countries : [DEFAULT_COUNTRY])
    : [countries || DEFAULT_COUNTRY]

  const adzunaResults = useAdzuna
    ? await Promise.all(
        roleQueries.flatMap((q) => countryCodes.map((c) => fetchAdzunaJobs(q, c, adzunaPages)))
      )
    : []

  // ATS is company-list-driven, not query/country-driven — fetch once regardless
  // of how many queries or countries were requested.
  const atsResults = useAts ? await fetchAtsJobs() : []
  // Respect an explicit source subset by filtering the ATS output down.
  const filteredAts = useAts
    ? atsResults.filter((j) => j.source && sources.includes(j.source))
    : []

  const fetched: Partial<Job>[] = [...adzunaResults.flat(), ...filteredAts]

  const seen = new Set<string>()
  const allRawJobs = fetched.filter(isRecent).filter((j) => {
    const key = `${j.source}:${j.source_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (allRawJobs.length === 0) {
    return { fetched: fetched.length, new: 0, duplicates: 0 }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("jobs")
    .upsert(allRawJobs, { onConflict: "source,source_id", ignoreDuplicates: true })
    .select("id")

  if (error) {
    console.error("Bulk job insert failed:", error.message)
    return { fetched: fetched.length, new: 0, duplicates: 0 }
  }

  const newCount = data?.length ?? 0
  return {
    fetched: fetched.length,
    new: newCount,
    duplicates: allRawJobs.length - newCount,
  }
}
