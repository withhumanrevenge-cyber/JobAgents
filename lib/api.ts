import { createClient } from "@/lib/supabase/client"

// The Python backend (backend/). Empty means same origin: on Vercel, vercel.json routes /api/* to
// the Python service. Local dev points this at the uvicorn server.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "")

// Calls the backend as the signed-in user: it reads the Supabase access token from the
// Authorization header (the backend can't see this app's auth cookies).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await createClient().auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`)
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  return fetch(`${API_URL}${path}`, { ...init, headers })
}
