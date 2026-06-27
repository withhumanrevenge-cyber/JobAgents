"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Users, Coins, DollarSign, Activity, Plus } from "lucide-react"
import { PLAN_LABEL } from "@/lib/plans"
import type { Plan } from "@/types"

interface Overview {
  totalUsers: number
  byPlan: { free: number; pro: number; premium: number }
  activeUsers: number
  newThisWeek: number
  tokensThisMonth: number
  creditsThisMonth: number
  smartAppliesThisMonth: number
  mrr: number
}

interface UserRow {
  user_id: string
  email: string | null
  full_name: string | null
  plan: string
  plan_expires_at: string | null
  is_admin: boolean
  created_at: string | null
  smart_apply: number
  tailor: number
  interview: number
  credits: number
  tokens: number
}

const PLAN_TONE: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  pro: "bg-blue-50 text-blue-700 border border-blue-200",
  premium: "bg-amber-50 text-amber-700 border border-amber-200",
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, u] = await Promise.all([
      fetch("/api/admin/overview").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ])
    if (!o.error) setOverview(o)
    if (!u.error) setUsers(u.users)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const setPlan = async (user_id: string, plan: Plan) => {
    setSavingId(user_id)
    try {
      const res = await fetch("/api/admin/set-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, plan }),
      })
      if (res.ok) setUsers((prev) => prev.map((u) => (u.user_id === user_id ? { ...u, plan } : u)))
    } finally { setSavingId(null) }
  }

  const grantCredits = async (user_id: string) => {
    const input = window.prompt("Grant how many bonus credits this month?")
    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0) return
    setSavingId(user_id)
    try {
      const res = await fetch("/api/admin/grant-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, amount }),
      })
      if (res.ok) setUsers((prev) => prev.map((u) => (u.user_id === user_id ? { ...u, credits: u.credits - amount } : u)))
    } finally { setSavingId(null) }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  }

  const numFmt = (n: number) => n.toLocaleString()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Admin overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">Users, tiers, credit usage, and AI consumption.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total users" value={numFmt(overview.totalUsers)} sub={`+${overview.newThisWeek} this week`} />
          <StatCard icon={DollarSign} label="Est. MRR" value={`$${numFmt(overview.mrr)}`} sub={`${overview.byPlan.pro} Pro · ${overview.byPlan.premium} Premium`} />
          <StatCard icon={Coins} label="Credits used (mo)" value={numFmt(overview.creditsThisMonth)} sub={`${overview.smartAppliesThisMonth} Smart Applies`} />
          <StatCard icon={Activity} label="AI tokens (mo)" value={numFmt(overview.tokensThisMonth)} sub={`${overview.activeUsers} active users`} />
        </div>
      )}

      <div>
        <p className="text-xs text-gray-400 mb-3">Users ({users.length})</p>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {["User", "Tier", "Credits used", "Smart Apply", "Tailor", "Interview", "Tokens", "Tier / Grant"].map((h) => (
                    <th key={h} className="py-3 px-4 text-[10px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-gray-900">{u.full_name || "—"}</p>
                      <p className="text-xs text-gray-400">{u.email || u.user_id.slice(0, 8)}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${PLAN_TONE[u.plan] ?? PLAN_TONE.free}`}>
                        {PLAN_LABEL[(u.plan as Plan)] ?? u.plan}{u.is_admin ? " · admin" : ""}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600 tabular-nums">{u.credits}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 tabular-nums">{u.smart_apply}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 tabular-nums">{u.tailor}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 tabular-nums">{u.interview}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 tabular-nums">{u.tokens.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={u.plan}
                          disabled={savingId === u.user_id}
                          onChange={(e) => setPlan(u.user_id, e.target.value as Plan)}
                          className="bg-white border border-gray-200 text-xs text-gray-600 rounded-md py-1 px-2 focus:outline-none focus:border-gray-900 cursor-pointer disabled:opacity-50"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                        </select>
                        <button
                          onClick={() => grantCredits(u.user_id)}
                          disabled={savingId === u.user_id}
                          title="Grant bonus credits"
                          className="border border-gray-200 text-gray-500 rounded-md p-1 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-gray-400 mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
