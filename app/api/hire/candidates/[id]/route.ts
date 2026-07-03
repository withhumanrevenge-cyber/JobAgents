import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { CandidateStatus } from "@/types"

const VALID: CandidateStatus[] = ["new", "shortlisted", "contacted", "rejected"]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { status } = await request.json().catch(() => ({}))
  if (!VALID.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 })

  const svc = createServiceClient()
  const { data: cm } = await svc.from("candidate_matches").select("posting_id").eq("id", id).single()
  if (!cm) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data: posting } = await svc.from("job_postings").select("recruiter_id").eq("id", cm.posting_id).single()
  if (posting?.recruiter_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await svc.from("candidate_matches").update({ status }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
