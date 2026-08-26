import { Job, JobSource, JobType, ExperienceLevel } from "@/types"
import { ATS_COMPANIES, AtsCompany } from "@/lib/atsCompanies"

const REQUEST_TIMEOUT_MS = 12_000
const PER_COMPANY_MAX = 200

// Two-character US state abbreviations we tolerate in "City, ST" locations.
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
])

const INDIA_CITIES = ["bangalore","bengaluru","hyderabad","chennai","mumbai","pune","gurgaon","gurugram","noida","delhi","new delhi","kolkata","ahmedabad","kochi","cochin","jaipur","chandigarh","indore","trivandrum","thiruvananthapuram"]
const UK_HINTS = ["london","manchester","edinburgh","birmingham","bristol","leeds","glasgow"]
const CANADA_HINTS = ["toronto","vancouver","montreal","ottawa","calgary","edmonton"]
const DE_HINTS = ["berlin","munich","münchen","hamburg","frankfurt","cologne","köln"]
const AU_HINTS = ["sydney","melbourne","brisbane","perth","adelaide"]

function detectCountry(loc: string): string {
  if (!loc) return "Unknown"
  const l = loc.toLowerCase()
  if (l.includes("india")) return "India"
  if (INDIA_CITIES.some((c) => l.includes(c))) return "India"
  if (l.includes("united states") || l.includes("u.s.") || l.includes("usa")) return "United States"
  if (l.includes("united kingdom") || l.includes(" uk") || l.endsWith(" uk") || l.includes(", uk")) return "United Kingdom"
  if (UK_HINTS.some((c) => l.includes(c))) return "United Kingdom"
  if (l.includes("canada") || CANADA_HINTS.some((c) => l.includes(c))) return "Canada"
  if (l.includes("germany") || DE_HINTS.some((c) => l.includes(c))) return "Germany"
  if (l.includes("france") || l.includes("paris")) return "France"
  if (l.includes("australia") || AU_HINTS.some((c) => l.includes(c))) return "Australia"
  if (l.includes("singapore")) return "Singapore"
  if (l.includes("ireland") || l.includes("dublin")) return "Ireland"
  if (l.includes("netherlands") || l.includes("amsterdam")) return "Netherlands"
  if (l.includes("brazil") || l.includes("são paulo") || l.includes("sao paulo")) return "Brazil"
  if (l.includes("mexico")) return "Mexico"
  if (l.includes("japan") || l.includes("tokyo")) return "Japan"
  if (l.includes("worldwide") || l.includes("anywhere") || l.includes("global") || l.includes("remote")) return "Worldwide"
  if (l.includes("europe") || l.includes("emea")) return "Europe"

  // Fallback: "City, XX" where XX is a US state.
  const parts = loc.split(",").map((p) => p.trim())
  const tail = parts[parts.length - 1]
  if (tail && US_STATES.has(tail.toUpperCase())) return "United States"

  return "Unknown"
}

function detectJobType(location: string, description: string, remoteFlag?: boolean): JobType {
  const h = `${location || ""} ${(description || "").slice(0, 500)}`.toLowerCase()
  if (h.includes("hybrid")) return "hybrid"
  if (remoteFlag || h.includes("remote") || h.includes("worldwide") || h.includes("anywhere") || h.includes("work from home")) return "remote"
  if (h.includes("on-site") || h.includes("onsite") || h.includes("in-office") || h.includes("in office")) return "onsite"
  return remoteFlag ? "remote" : "unknown"
}

function detectExperienceLevel(title: string): ExperienceLevel {
  const t = (title || "").toLowerCase()
  if (/\b(staff|principal|architect|distinguished|director|vp|head of|tech lead|engineering manager|founding)\b/.test(t)) return "lead"
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior"
  if (/\b(junior|jr\.?|entry[- ]?level|intern|internship|associate|graduate|new grad)\b/.test(t)) return "entry"
  if (/\bengineer\s+i\b/.test(t)) return "entry"
  if (/\bengineer\s+iii\b|\bengineer\s+iv\b/.test(t)) return "senior"
  return "mid"
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Some sources (Greenhouse's `content` field) return HTML whose angle brackets
// are themselves entity-encoded. We MUST decode entities before stripping tags,
// otherwise `<div>` hidden as `&lt;div&gt;` survives the tag regex and leaks
// markup into the description.
function stripHtml(input: string): string {
  const decoded = decodeEntities(decodeEntities(input))
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    if (!res.ok) return null
    return res
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

interface GreenhouseJob {
  id: number
  title?: string
  absolute_url?: string
  location?: { name?: string }
  departments?: { name?: string }[]
  metadata?: { name?: string; value?: string | null }[]
  content?: string
  updated_at?: string
  first_published?: string
  company_name?: string
}

export async function fetchGreenhouse(slug: string): Promise<Partial<Job>[]> {
  const res = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)
  if (!res) return []
  let data: { jobs?: GreenhouseJob[] }
  try { data = await res.json() } catch { return [] }
  const jobs = (data.jobs || []).slice(0, PER_COMPANY_MAX)

  return jobs.map((j) => {
    const loc = j.location?.name || ""
    const desc = j.content ? stripHtml(j.content).slice(0, 4000) : ""
    const jobType = detectJobType(loc, desc)
    const dept = (j.departments || [])[0]?.name
    const empType = (j.metadata || []).find((m) => m?.name === "Employment Type")?.value || null
    const title = j.title || "Untitled role"
    const tags: string[] = []
    if (dept) tags.push(dept)
    if (typeof empType === "string" && empType) tags.push(empType)

    const posted = j.first_published || j.updated_at || null
    return {
      title,
      company: j.company_name || slug,
      location: loc || null,
      country: detectCountry(loc),
      region: null,
      remote: jobType === "remote",
      job_type: jobType,
      experience_level: detectExperienceLevel(title),
      url: j.absolute_url || `https://boards.greenhouse.io/${slug}`,
      description: desc,
      salary_range: null,
      tags,
      posted_date: posted ? new Date(posted).toISOString() : new Date().toISOString(),
      source: "greenhouse" as JobSource,
      source_id: String(j.id),
    }
  })
}

interface LeverJob {
  id: string
  text?: string
  hostedUrl?: string
  categories?: { location?: string; department?: string; commitment?: string; team?: string }
  descriptionPlain?: string
  createdAt?: number
}

export async function fetchLever(slug: string): Promise<Partial<Job>[]> {
  const res = await safeFetch(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  if (!res) return []
  let data: LeverJob[]
  try { data = await res.json() } catch { return [] }
  if (!Array.isArray(data)) return []
  const jobs = data.slice(0, PER_COMPANY_MAX)

  return jobs.map((j) => {
    const loc = j.categories?.location || ""
    const desc = (j.descriptionPlain || "").slice(0, 4000)
    const jobType = detectJobType(loc, desc)
    const title = j.text || "Untitled role"
    const tags: string[] = []
    if (j.categories?.department) tags.push(j.categories.department)
    if (j.categories?.team) tags.push(j.categories.team)
    if (j.categories?.commitment) tags.push(j.categories.commitment)

    return {
      title,
      company: slug,
      location: loc || null,
      country: detectCountry(loc),
      region: null,
      remote: jobType === "remote",
      job_type: jobType,
      experience_level: detectExperienceLevel(title),
      url: j.hostedUrl || `https://jobs.lever.co/${slug}`,
      description: desc,
      salary_range: null,
      tags,
      posted_date: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
      source: "lever" as JobSource,
      source_id: String(j.id),
    }
  })
}

interface AshbyJob {
  id: string
  title?: string
  location?: string
  isRemote?: boolean
  employmentType?: string
  department?: string
  team?: string
  publishedAt?: string
  jobUrl?: string
  applyUrl?: string
  externalLink?: string | null
  descriptionPlain?: string
  descriptionHtml?: string
}

export async function fetchAshby(slug: string): Promise<Partial<Job>[]> {
  const res = await safeFetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
  if (!res) return []
  let data: { jobs?: AshbyJob[] }
  try { data = await res.json() } catch { return [] }
  const jobs = (data.jobs || []).slice(0, PER_COMPANY_MAX)

  return jobs.map((j) => {
    const loc = j.location || ""
    const desc = (j.descriptionPlain || (j.descriptionHtml ? stripHtml(j.descriptionHtml) : "")).slice(0, 4000)
    const jobType = detectJobType(loc, desc, j.isRemote)
    const title = j.title || "Untitled role"
    const tags: string[] = []
    if (j.department) tags.push(j.department)
    if (j.team) tags.push(j.team)
    if (j.employmentType) tags.push(j.employmentType)

    return {
      title,
      company: slug,
      location: loc || null,
      country: detectCountry(loc),
      region: null,
      remote: !!j.isRemote || jobType === "remote",
      job_type: jobType,
      experience_level: detectExperienceLevel(title),
      url: j.externalLink || j.applyUrl || j.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
      description: desc,
      salary_range: null,
      tags,
      posted_date: j.publishedAt ? new Date(j.publishedAt).toISOString() : new Date().toISOString(),
      source: "ashby" as JobSource,
      source_id: String(j.id),
    }
  })
}

async function fetchOne(c: AtsCompany): Promise<Partial<Job>[]> {
  try {
    if (c.ats === "greenhouse") return await fetchGreenhouse(c.slug)
    if (c.ats === "lever")      return await fetchLever(c.slug)
    if (c.ats === "ashby")      return await fetchAshby(c.slug)
    return []
  } catch (e) {
    console.warn(`ATS fetch failed for ${c.ats}/${c.slug}:`, e instanceof Error ? e.message : e)
    return []
  }
}

// Bound concurrency so we don't fan out 30+ simultaneous requests.
const ATS_CONCURRENCY = 6

export async function fetchAtsJobs(companies: AtsCompany[] = ATS_COMPANIES): Promise<Partial<Job>[]> {
  const out: Partial<Job>[] = []
  for (let i = 0; i < companies.length; i += ATS_CONCURRENCY) {
    const chunk = companies.slice(i, i + ATS_CONCURRENCY)
    const results = await Promise.all(chunk.map(fetchOne))
    for (const r of results) out.push(...r)
  }
  return out
}
