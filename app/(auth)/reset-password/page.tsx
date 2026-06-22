"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2, CheckCircle } from "lucide-react"

export default function ResetPasswordPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { supabase.auth.getSession() }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 8)  { setError("Minimum 8 characters."); return }
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) setError(err.message)
    else { setDone(true); setTimeout(() => router.push("/dashboard"), 2500) }
  }

  const inputCls = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors"

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8">
      <h1 className="text-base font-semibold text-gray-900 mb-1">Set new password</h1>
      <p className="text-sm text-gray-500 mb-6">Choose a strong password for your account.</p>

      {done ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
          <p className="text-sm text-gray-600">Password updated. Redirecting...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">New password</label>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Confirm password</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" className={inputCls} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </div>
  )
}
