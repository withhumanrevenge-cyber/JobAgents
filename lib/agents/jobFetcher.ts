import { createServiceClient } from "@/lib/supabase/server"
import { Job, JobSource, JobType, ExperienceLevel } from "@/types"
import { ADZUNA_SUPPORTED, COUNTRY_NAME, DEFAULT_COUNTRY } from "@/lib/countries"

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

const RECENT_DAYS = 30

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

function normalizeRemotiveCountry(loc: string | undefined): string | null {
  if (!loc) return null
  const lower = loc.toLowerCase()
  if (lower.includes("usa") || lower.includes("united states") || lower.includes("u.s.")) return "United States"
  if (lower.includes("canada")) return "Canada"
  if (lower.includes("united kingdom") || lower.includes("uk")) return "United Kingdom"
  if (lower.includes("germany")) return "Germany"
  if (lower.includes("worldwide") || lower.includes("anywhere") || lower.includes("global")) return "Worldwide"
  if (lower.includes("europe") || lower.includes("emea")) return "Europe"
  if (lower.includes("apac") || lower.includes("asia")) return "Asia"
  if (lower.includes("latam") || lower.includes("south america")) return "Latin America"
  const trimmed = loc.trim()
  return trimmed.length > 0 && trimmed.length < 50 ? trimmed : null
}

interface RemotiveJob {
  id: number
  title?: string
  company_name?: string
  candidate_required_location?: string
  url?: string
  description?: string
  salary?: string
  tags?: string | string[]
  publication_date?: string
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

interface JSearchJob {
  job_id: string
  job_title?: string
  employer_name?: string
  job_city?: string
  job_state?: string
  job_country?: string
  job_is_remote?: boolean
  job_apply_link?: string
  job_description?: string
  job_min_salary?: number
  job_max_salary?: number
  job_required_skills?: string[]
  job_posted_at_datetime_utc?: string
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

export async function fetchRemotiveJobs(query?: string): Promise<Partial<Job>[]> {
  try {
    const url = query
      ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=80`
      : `https://remotive.com/api/remote-jobs?category=software-dev&limit=80`
    const res = await fetchWithRetry(url, {
      next: { revalidate: 0 },
    })
    const data = await res.json()
    const rawJobs: RemotiveJob[] = data.jobs || []

    return rawJobs.map((job: RemotiveJob) => {
      const tags = Array.isArray(job.tags)
        ? job.tags
        : typeof job.tags === "string"
        ? [job.tags]
        : []

      const loc = job.candidate_required_location || "Remote"
      const country = normalizeRemotiveCountry(job.candidate_required_location)
      const title = job.title || "Software Engineer"
      return {
        title,
        company: job.company_name || "Unknown Company",
        location: loc,
        country,
        region: null,
        remote: true,
        job_type: detectJobType(loc, job.description || null, true),
        experience_level: detectExperienceLevel(title),
        url: job.url || "https://remotive.com",
        description: job.description || "",
        salary_range: job.salary || null,
        tags: tags.slice(0, 10),
        posted_date: job.publication_date ? new Date(job.publication_date).toISOString() : new Date().toISOString(),
        source: "remotive" as JobSource,
        source_id: String(job.id),
      }
    })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("Failed to fetch from Remotive:", errMsg)
    return []
  }
}

export async function fetchAdzunaJobs(query = "software engineer", countryCode = DEFAULT_COUNTRY): Promise<Partial<Job>[]> {
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
    const pages = [1, 2, 3, 4, 5]
    const pageResults = await Promise.all(
      pages.map(async (page) => {
        try {
          const url = `https://api.adzuna.com/v1/api/jobs/${cc.toLowerCase()}/search/${page}?app_id=${appId}&app_key=${appKey}&what=${encodedQuery}&results_per_page=50`
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

export async function fetchJSearchJobs(query = "software engineer", countryCode = DEFAULT_COUNTRY): Promise<Partial<Job>[]> {
  const apiKey = process.env.RAPIDAPI_KEY

  if (!apiKey || apiKey.includes("your-rapidapi")) {
    console.warn("JSearch RapidAPI Key missing. Skipping JSearch fetch.")
    return []
  }

  try {
    const cc = countryCode.toUpperCase()
    const encodedQuery = encodeURIComponent(query)
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodedQuery}&page=1&num_pages=2&country=${cc}`
    const res = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
      next: { revalidate: 0 },
    })
    const data = await res.json()
    const results: JSearchJob[] = data.data || []

    return results.map((job: JSearchJob) => {
      const tags: string[] = []
      if (job.job_required_skills) {
        tags.push(...job.job_required_skills.slice(0, 5))
      }

      const salaryMin = job.job_min_salary ? `$${Math.round(job.job_min_salary / 1000)}k` : ""
      const salaryMax = job.job_max_salary ? `$${Math.round(job.job_max_salary / 1000)}k` : ""
      const salary = salaryMin && salaryMax ? `${salaryMin} - ${salaryMax}` : salaryMin || null

      const jsLoc = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ") || ""
      const jsIsRemote = job.job_is_remote ?? false
      const countryMap: Record<string, string> = { US: "United States", GB: "United Kingdom", CA: "Canada", DE: "Germany", FR: "France", IN: "India", AU: "Australia" }
      const country = job.job_country ? (countryMap[job.job_country] || job.job_country) : null
      const title = job.job_title || "Untitled role"
      return {
        title,
        company: job.employer_name || "Unknown Company",
        location: jsLoc || null,
        country,
        region: job.job_state || null,
        remote: jsIsRemote,
        job_type: detectJobType(jsLoc, job.job_description || null, jsIsRemote),
        experience_level: detectExperienceLevel(title),
        url: job.job_apply_link || "https://jsearch.p.rapidapi.com",
        description: job.job_description || "",
        salary_range: salary,
        tags,
        posted_date: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc).toISOString() : new Date().toISOString(),
        source: "jsearch" as JobSource,
        source_id: String(job.job_id),
      }
    })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("Failed to fetch from JSearch:", errMsg)
    return []
  }
}

export async function syncAllJobs(
  queries?: string | string[],
  countries?: string | string[],
  opts?: { sources?: JobSource[] },
): Promise<{ fetched: number; new: number; duplicates: number }> {
  const sources = opts?.sources ?? ["remotive", "adzuna", "jsearch"]
  const useRemotive = sources.includes("remotive")
  const useAdzuna   = sources.includes("adzuna")
  const useJSearch  = sources.includes("jsearch")

  const roleQueries: (string | undefined)[] = Array.isArray(queries)
    ? (queries.length > 0 ? queries : [undefined])
    : [queries]

  const countryCodes: string[] = Array.isArray(countries)
    ? (countries.length > 0 ? countries : [DEFAULT_COUNTRY])
    : [countries || DEFAULT_COUNTRY]

  const perPairResults = await Promise.all(
    roleQueries.flatMap((q) =>
      countryCodes.map((c) => Promise.all([
        useAdzuna  ? fetchAdzunaJobs(q, c)  : Promise.resolve([] as Partial<Job>[]),
        useJSearch ? fetchJSearchJobs(q, c) : Promise.resolve([] as Partial<Job>[]),
      ]))
    )
  )
  const remotiveResults = useRemotive
    ? await Promise.all(roleQueries.map((q) => fetchRemotiveJobs(q)))
    : []

  const fetched: Partial<Job>[] = [...perPairResults.flat(2), ...remotiveResults.flat()]

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
