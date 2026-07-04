import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { matchCandidatesForPosting } from "@/lib/agents/candidateAgent"

export const runtime = "nodejs"
export const maxDuration = 60

async function ownsPosting(userId: string, postingId: string): Promise<boolean> {
  const svc = createServiceClient()
  const { data } = await svc.from("job_postings").select("recruiter_id").eq("id", postingId).single()
  return data?.recruiter_id === userId
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const svc = createServiceClient()
  const { data: posting } = await svc.from("job_postings").select("*").eq("id", id).single()
  if (!posting) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (posting.recruiter_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: matches } = await svc
    .from("candidate_matches")
    .select("*")
    .eq("posting_id", id)
    .order("match_score", { ascending: false })

  const rows = matches || []
  const candidateIds = rows.map((m) => m.candidate_id)

  const profiles: Record<string, { full_name: string | null; email: string | null; linkedin_url: string | null; parsed_resume: unknown }> = {}
  if (candidateIds.length > 0) {
    const { data: profs } = await svc
      .from("profiles")
      .select("user_id, full_name, email, linkedin_url, parsed_resume, open_to_work")
      .in("user_id", candidateIds)
    for (const p of profs || []) {
      if (p.open_to_work) {
        profiles[p.user_id] = {
          full_name: p.full_name,
          email: p.email,
          linkedin_url: p.linkedin_url,
          parsed_resume: p.parsed_resume,
        }
      }
    }
  }

  const candidates = rows
    .filter((m) => profiles[m.candidate_id])
    .map((m) => ({ ...m, candidate: profiles[m.candidate_id] }))

  const { data: me } = await svc.from("profiles").select("match_threshold").eq("user_id", user.id).single()

  return NextResponse.json({ posting, candidates, threshold: me?.match_threshold ?? 70 })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  if (!(await ownsPosting(user.id, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const result = await matchCandidatesForPosting(id)
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to score candidates." }, { status: 500 })
  }
}
