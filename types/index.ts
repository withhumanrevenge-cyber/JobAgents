export type JobStatus =
  | 'pending'
  | 'reviewed'
  | 'applied'
  | 'skipped'
  | 'interview'
  | 'rejected'
  | 'offer'

export type Plan = 'free' | 'pro' | 'premium'
export type UsageAction = 'smart_apply' | 'tailor' | 'interview'

export type JobSource = 'remotive' | 'adzuna' | 'jsearch'
export type JobType = 'remote' | 'hybrid' | 'onsite' | 'unknown'
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'unknown'
export type TimeFilter = '24h' | '7d' | '30d'

export interface Job {
  id: string
  title: string
  company: string
  location: string | null
  country: string | null
  region: string | null
  remote: boolean
  job_type: JobType
  experience_level: ExperienceLevel
  url: string
  description: string | null
  salary_range: string | null
  tags: string[]
  posted_date: string | null
  source: JobSource
  source_id: string
  created_at: string
}

export interface ParsedResume {
  name: string
  email: string
  phone: string
  target_role: string
  years_experience: number
  skills: string[]
  summary: string
  experience: {
    company: string
    title: string
    dates: string
    bullets: string[]
  }[]
  education: {
    school: string
    degree: string
    year: string
  }[]
  certifications?: string[]
  projects?: {
    name: string
    description: string
    tech: string[]
    url?: string
  }[]
}

export interface InterviewQuestion {
  question: string
  category: 'technical' | 'behavioral' | 'role-specific' | 'situational'
  tip: string
}

export interface Match {
  id: string
  user_id: string
  job_id: string
  job?: Job
  match_score: number
  match_reason: string | null
  matched_skills: string[]
  missing_skills: string[]
  status: JobStatus
  tailored_resume_url: string | null
  tailored_resume_json: ResumeData | null
  interview_questions: InterviewQuestion[] | null
  interview_generated_at: string | null
  cover_letter: string | null
  cover_letter_generated_at: string | null
  applied_at: string | null
  notes: string | null
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  github_username: string | null
  linkedin_url: string | null
  base_resume_url: string | null
  parsed_resume: ParsedResume | null
  resume_parsed_at: string | null
  target_roles: string[]
  target_country: string | null
  match_threshold: number
  auto_apply: boolean
  onboarded: boolean
  email_notifications: boolean
  plan: Plan
  plan_expires_at: string | null
  is_admin: boolean
  billing_provider: 'razorpay' | 'lemonsqueezy' | null
  billing_customer_id: string | null
  billing_subscription_id: string | null
}

export interface ResumeData {
  name: string
  email: string
  phone: string
  summary: string
  skills: string[]
  ats_score?: number
  experience: {
    company: string
    title: string
    dates: string
    bullets: string[]
  }[]
  education: {
    school: string
    degree: string
    year: string
  }[]
  projects: {
    name: string
    description: string
    tech: string[]
    url?: string
  }[]
}

export interface MatchScoreResult {
  score: number
  reason: string
  matched_skills: string[]
  missing_skills: string[]
}

export interface JobFetchResult {
  fetched: number
  new: number
  duplicates: number
}

export interface DashboardStats {
  totalJobs: number
  matches: number
  applicationsSent: number
  interviews: number
}
