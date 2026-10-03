import { createClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Defense in depth: check both DB flag AND env allowlist
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) ?? []
  if (!adminEmails.includes(user.email?.toLowerCase() ?? "")) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  return profile?.is_admin ? user : null
}
