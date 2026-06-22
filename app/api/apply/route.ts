import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { match_id, notes } = await request.json()
    if (!match_id) {
      return NextResponse.json({ error: "Missing match_id" }, { status: 400 })
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("id", match_id)
      .eq("user_id", user.id)
      .single()

    if (matchError || !match) {
      return NextResponse.json({ error: "Match record not found" }, { status: 404 })
    }

    const updateData: { status: string; applied_at: string; notes?: string } = {
      status: "applied",
      applied_at: new Date().toISOString(),
    }
    if (notes !== undefined) {
      updateData.notes = notes
    }

    const { error: updateError } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", match_id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("Error applying for job:", err)
    const errMsg = err instanceof Error ? err.message : "Failed to submit application"
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

