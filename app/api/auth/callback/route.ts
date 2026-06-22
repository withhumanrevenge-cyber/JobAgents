import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .single()

      if (!profile) {
        const fullName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || ""
        const email = data.user.email || ""

        await supabase.from("profiles").insert({
          user_id: data.user.id,
          full_name: fullName,
          email,
          match_threshold: 70,
          auto_apply: false,
          onboarded: false,
        })

        return NextResponse.redirect(new URL("/onboarding", requestUrl.origin))
      }
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
