import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const token_hash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type") as
    | "signup"
    | "email"
    | "recovery"
    | "invite"
    | "magiclink"
    | null
  // Only same-site paths: "//evil.com" or "/\evil.com" would send the freshly signed-in user
  // to another site.
  const rawNext = requestUrl.searchParams.get("next") ?? ""
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : "/dashboard"

  const supabase = await createClient()

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, onboarded")
        .eq("user_id", data.user.id)
        .maybeSingle()

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
      if (!profile.onboarded) {
        return NextResponse.redirect(new URL("/onboarding", requestUrl.origin))
      }
    }
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}

