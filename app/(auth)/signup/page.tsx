"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2, CheckCircle } from "lucide-react"

export default function SignupPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState("")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setSuccess(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      })
      if (err) throw err
      if (data.session) {
        await supabase.from("profiles").upsert({ user_id: data.session.user.id, full_name: fullName, email, match_threshold: 70, auto_apply: false, onboarded: false }, { onConflict: "user_id" })
        const asRecruiter = new URLSearchParams(window.location.search).get("as") === "recruiter"
        router.push(asRecruiter ? "/onboarding?as=recruiter" : "/onboarding"); router.refresh()
      } else {
        setSuccess("Check your email to confirm your account.")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.")
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setError(null); setGoogleLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google", options: { redirectTo: `${window.location.origin}/api/auth/callback` },
      })
      if (err) throw err
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.")
      setGoogleLoading(false)
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-md px-3 py-2.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none transition-colors"

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8">
      <h1 className="text-base font-semibold text-gray-900 mb-1">Create an account</h1>
      <p className="text-sm text-gray-500 mb-6">Start finding jobs that fit</p>

      {error   && <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>}
      {success && (
        <div className="mb-4 px-3 py-2.5 bg-green-50 border border-green-200 rounded-md text-xs text-green-700 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />{success}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Full name</label>
          <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Password</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} className={inputCls} />
        </div>
        <button type="submit" disabled={loading || googleLoading}
          className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Create account
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-gray-400">or</span></div>
      </div>

      <button onClick={handleGoogle} disabled={loading || googleLoading}
        className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-md py-2 text-sm text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-50">
        {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
        )}
        Continue with Google
      </button>

      <p className="mt-5 text-center text-[11px] text-gray-400 leading-relaxed">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">Terms</Link> and{" "}
        <Link href="/privacy" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">Privacy Policy</Link>.
      </p>

      <p className="mt-3 text-center text-xs text-gray-400">
        Already have an account?{" "}
        <Link href="/login" className="text-gray-900 font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
