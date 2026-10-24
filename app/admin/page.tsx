"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Users, Coins, DollarSign, Activity, Plus } from "lucide-react"
import { PLAN_LABEL } from "@/lib/plans"
import type { Plan } from "@/types"
import { apiFetch } from "@/lib/api"

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

interface Funnel {
  days: number
  funnel: Record<"signed_up" | "uploaded_resume" | "got_scored_jobs" | "used_ai_tool" | "finished_proof" | "applied" | "reached_interview" | "got_offer" | "paying", number>
  interview_rate: { all: number | null; with_proof: number | null; without_proof: number | null; applied_with_proof: number; applied_without_proof: number }
  proofs: { started: number; completed: number }
  decisions: { invited: number; on_time: number; timed_out: number; intros_accepted: number }
}

const FUNNEL_STEPS: { key: keyof Funnel["funnel"]; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "uploaded_resume", label: "Uploaded a resume" },
  { key: "got_scored_jobs", label: "Got scored jobs" },
  { key: "used_ai_tool", label: "Used an AI tool" },
  { key: "finished_proof", label: "Finished a Proof of Fit" },
  { key: "applied", label: "Marked an application" },
  { key: "reached_interview", label: "Reached interview" },
  { key: "got_offer", label: "Got an offer" },
  { key: "paying", label: "Paying now" },
]

const pct = (v: number | null) => (v === null ? "—" : `${v}%`)

function FunnelPanel({ data }: { data: Funnel }) {
  const top = data.funnel.signed_up || 1
  const ir = data.interview_rate
  const d = data.decisions
  const decided = d.on_time + d.timed_out
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Seekers who signed up in the last {data.days} days</p>
        <p className="text-xs text-muted-foreground mt-0.5">Interview rate is the share of people who applied that reached at least one interview.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-border rounded-md p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Interview rate</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{pct(ir.all)}</p>
        </div>
        <div className="border border-border rounded-md p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">With a proof</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{pct(ir.with_proof)}</p>
          <p className="text-[11px] text-muted-foreground">{ir.applied_with_proof} applied</p>
        </div>
        <div className="border border-border rounded-md p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Without a proof</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{pct(ir.without_proof)}</p>
          <p className="text-[11px] text-muted-foreground">{ir.applied_without_proof} applied</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {FUNNEL_STEPS.map(({ key, label }) => {
          const v = data.funnel[key]
          return (
            <div key={key} className="grid grid-cols-[minmax(0,170px)_minmax(0,1fr)_56px] items-center gap-3 text-xs">
              <span className="text-foreground/80 truncate">{label}</span>
              <div className="h-2 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(v / top) * 100}%` }} /></div>
              <span className="text-right tabular-nums text-foreground">{v.toLocaleString()}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Proofs: {data.proofs.completed} of {data.proofs.started} finished · Invitations: {d.invited} ·
        Decided on time: {decided ? `${Math.round((d.on_time / decided) * 100)}%` : "—"} ({d.timed_out} timed out) ·
        Introductions accepted: {d.intros_accepted}
      </p>
    </div>
  )
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
  free: "bg-accent text-foreground/80",
  pro: "bg-blue-50 text-blue-700 border border-blue-200",
  premium: "bg-amber-50 text-amber-700 border border-amber-200",
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [funnel, setFunnel] = useState<Funnel | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, u, f] = await Promise.all([
      apiFetch("/api/admin/overview").then((r) => r.json()),
      apiFetch("/api/admin/users").then((r) => r.json()),
      apiFetch("/api/admin/funnel").then((r) => r.json()),
    ])
    if (!o.error) setOverview(o)
    if (!u.error) setUsers(u.users)
    // Missing until migration 013 is applied; the rest of the page works without it.
    if (!f.error && f.funnel) setFunnel(f)
    setLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const setPlan = async (user_id: string, plan: Plan) => {
    setSavingId(user_id)
    try {
      const res = await apiFetch("/api/admin/set-plan", {
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
      const res = await apiFetch("/api/admin/grant-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, amount }),
      })
      if (res.ok) setUsers((prev) => prev.map((u) => (u.user_id === user_id ? { ...u, credits: u.credits - amount } : u)))
    } finally { setSavingId(null) }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  const numFmt = (n: number) => n.toLocaleString()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Admin overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Users, tiers, credit usage, and AI consumption.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total users" value={numFmt(overview.totalUsers)} sub={`+${overview.newThisWeek} this week`} />
          <StatCard icon={DollarSign} label="Est. MRR" value={`$${numFmt(overview.mrr)}`} sub={`${overview.byPlan.pro} Pro · ${overview.byPlan.premium} Premium`} />
          <StatCard icon={Coins} label="Credits used (mo)" value={numFmt(overview.creditsThisMonth)} sub={`${overview.smartAppliesThisMonth} Smart Applies`} />
          <StatCard icon={Activity} label="AI tokens (mo)" value={numFmt(overview.tokensThisMonth)} sub={`${overview.activeUsers} active users`} />
        </div>
      )}

      {funnel && <FunnelPanel data={funnel} />}

      <div>
        <p className="text-xs text-muted-foreground mb-3">Users ({users.length})</p>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  {["User", "Tier", "Credits used", "Smart Apply", "Tailor", "Interview", "Tokens", "Tier / Grant"].map((h) => (
                    <th key={h} className="py-3 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-muted transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-foreground">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email || u.user_id.slice(0, 8)}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${PLAN_TONE[u.plan] ?? PLAN_TONE.free}`}>
                        {PLAN_LABEL[(u.plan as Plan)] ?? u.plan}{u.is_admin ? " · admin" : ""}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-foreground/80 tabular-nums">{u.credits}</td>
                    <td className="py-3 px-4 text-xs text-foreground/80 tabular-nums">{u.smart_apply}</td>
                    <td className="py-3 px-4 text-xs text-foreground/80 tabular-nums">{u.tailor}</td>
                    <td className="py-3 px-4 text-xs text-foreground/80 tabular-nums">{u.interview}</td>
                    <td className="py-3 px-4 text-xs text-foreground/80 tabular-nums">{u.tokens.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={u.plan}
                          disabled={savingId === u.user_id}
                          onChange={(e) => setPlan(u.user_id, e.target.value as Plan)}
                          className="bg-card border border-border text-xs text-foreground/80 rounded-md py-1 px-2 focus:outline-none focus:border-foreground cursor-pointer disabled:opacity-50"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                        </select>
                        <button
                          onClick={() => grantCredits(u.user_id)}
                          disabled={savingId === u.user_id}
                          title="Grant bonus credits"
                          className="border border-border text-muted-foreground rounded-md p-1 hover:border-foreground/40 hover:text-foreground disabled:opacity-50 transition-colors"
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
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}
