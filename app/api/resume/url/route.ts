import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const EXPIRY_SECONDS = 300

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const svc = createServiceClient()
  const { data: profile } = await svc
    .from("profiles")
    .select("base_resume_url")
    .eq("user_id", user.id)
    .single()

  const stored: string | null = profile?.base_resume_url ?? null
  if (!stored) return NextResponse.json({ error: "No resume on file." }, { status: 404 })

  // Rows written before the bucket went private hold a full public URL; newer ones hold the
  // storage path. Normalize both to a path.
  const path = stored.includes("/resumes/")
    ? stored.split("/resumes/")[1].split("?")[0]
    : stored

  // Files live under `<user_id>/…`, so this also guarantees a user can only sign their own.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await svc.storage.from("resumes").createSignedUrl(path, EXPIRY_SECONDS)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not generate a link for this resume." }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
