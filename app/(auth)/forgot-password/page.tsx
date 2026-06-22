"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2, ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail]   = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8">
      <h1 className="text-base font-semibold text-gray-900 mb-1">Reset password</h1>
      <p className="text-sm text-gray-500 mb-6">
        {sent ? "Check your inbox for a reset link." : "Enter your email and we'll send a reset link."}
      </p>

      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A reset link was sent to <strong>{email}</strong>. Check your spam folder if you don&apos;t see it.
          </p>
          <Link href="/login" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors" />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading || !email}
            className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "Sending..." : "Send reset link"}
          </button>

          <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to sign in
          </Link>
        </form>
      )}
    </div>
  )
}
