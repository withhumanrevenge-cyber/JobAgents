import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BadgeCheck } from "lucide-react"
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge"
import { ProofReport } from "@/components/proofs/ProofReport"
import { formatDate } from "@/lib/utils"
import type { PublicProof } from "@/types"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "")

async function getProof(slug: string): Promise<PublicProof | null> {
  if (!API_URL) return null
  const res = await fetch(`${API_URL}/api/public/proofs/${encodeURIComponent(slug)}`, { cache: "no-store" })
  return res.ok ? res.json() : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const proof = await getProof((await params).slug)
  if (!proof) return { title: "Proof of Fit · JobAgent", robots: { index: false } }
  return {
    title: `${proof.name} · Proof of Fit for ${proof.role_title}`,
    description: proof.report.summary,
    // Shared by the candidate for people they send it to, not for search engines.
    robots: { index: false, follow: false },
  }
}

export default async function PublicProofPage({ params }: { params: Promise<{ slug: string }> }) {
  const proof = await getProof((await params).slug)
  if (!proof) notFound()

  return (
    <div className="min-h-screen bg-muted font-sans">
      <div className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 space-y-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="w-4 h-4" /> Proof of Fit · JobAgent
        </div>
        <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground">{proof.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{proof.role_title} · {formatDate(proof.completed_at)}</p>
            </div>
            <MatchScoreBadge score={proof.score} size="lg" />
          </div>
          <ProofReport report={proof.report} />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {proof.name.split(" ")[0]} answered three timed questions about this role, each with a follow-up written from their own answer.
          Quotes are taken word for word from those answers. <Link href="/" className="underline text-foreground/80">What is JobAgent?</Link>
        </p>
      </div>
    </div>
  )
}
