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
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"

  const supabase = await createClient()

  // Path 1: PKCE code exchange (OAuth providers and some email flows)
  if (code) {
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

  // Path 2: Email confirmation via token_hash (Supabase email templates)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      // Email confirmed — send them to onboarding or dashboard
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}

