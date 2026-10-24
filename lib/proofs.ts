import { apiFetch } from "@/lib/api"

// Starts (or resumes, if one is still in progress) a Proof of Fit and returns its id.
// No target: the user's own target role.
export async function startProof(body: { posting_id?: string; job_id?: string } = {}): Promise<string> {
  const res = await apiFetch("/api/proofs", { method: "POST", body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Couldn't start the proof.")
  return data.id as string
}
