"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Plus, Users, Briefcase, ArrowRight } from "lucide-react"
import { JOB_TYPE_LABEL } from "@/lib/status"
import type { JobPosting, JobType } from "@/types"

type PostingRow = JobPosting & { candidate_count: number }

export default function HireDashboard() {
  const [postings, setPostings] = useState<PostingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/hire/postings")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setPostings(d.postings) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  }

  const openRoles = postings.filter((p) => p.status === "open").length
  const totalCandidates = postings.reduce((sum, p) => sum + p.candidate_count, 0)

  if (postings.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-5">
          <Briefcase className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Hire with AI-matched candidates</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Post a role and we&apos;ll rank candidates from our opt-in talent pool against it — scored 0&ndash;100 on skills, experience, and fit.
        </p>
        <Link href="/hire/new" className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-gray-700 transition-colors mt-6">
          <Plus className="w-4 h-4" /> Post your first role
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Hiring</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your open roles and matched candidates.</p>
        </div>
        <Link href="/hire/new" className="inline-flex items-center justify-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-gray-700 transition-colors shrink-0">
          <Plus className="w-4 h-4" /> Post a role
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={Briefcase} label="Open roles" value={openRoles} />
        <StatCard icon={Briefcase} label="Total roles" value={postings.length} />
        <StatCard icon={Users} label="Candidates" value={totalCandidates} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {postings.map((p) => (
          <Link key={p.id} href={`/hire/${p.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50 transition-colors group">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${p.status === "open" ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500"}`}>{p.status}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {p.company} · {p.location || "—"} · {JOB_TYPE_LABEL[p.job_type as JobType] ?? p.job_type}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-500">{p.candidate_count} candidate{p.candidate_count === 1 ? "" : "s"}</span>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-gray-400 mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}
