import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { JobType, ExperienceLevel } from "@/types"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: postings, error } = await supabase
    .from("job_postings")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const svc = createServiceClient()
  const ids = (postings || []).map((p) => p.id)
  const counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: cms } = await svc.from("candidate_matches").select("posting_id").in("posting_id", ids)
    for (const cm of cms || []) counts[cm.posting_id] = (counts[cm.posting_id] || 0) + 1
  }

  return NextResponse.json({
    postings: (postings || []).map((p) => ({ ...p, candidate_count: counts[p.id] || 0 })),
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { title, company, location, job_type, experience_level, description, skills, salary_range } = body
  if (!title || !company || !description) {
    return NextResponse.json({ error: "Title, company, and description are required." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("job_postings")
    .insert({
      recruiter_id: user.id,
      title,
      company,
      location: location || null,
      job_type: (job_type as JobType) || "onsite",
      experience_level: (experience_level as ExperienceLevel) || "mid",
      description,
      skills: Array.isArray(skills) ? skills.filter(Boolean) : [],
      salary_range: salary_range || null,
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("profiles").update({ account_type: "recruiter" }).eq("user_id", user.id)

  return NextResponse.json({ id: data.id })
}
