"use client"

import { motion, useReducedMotion } from "framer-motion"
import { snappy } from "@/lib/motion"

interface MatchScoreBadgeProps {
  score: number
  size?: "sm" | "md" | "lg"
}

export function MatchScoreBadge({ score, size = "md" }: MatchScoreBadgeProps) {
  const prefersReduced = useReducedMotion()
  const s = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  }[size]

  if (score < 0) {
    return <span className={`font-medium border border-gray-200 rounded-md bg-gray-50 text-gray-400 ${s}`}>—</span>
  }

  const cls =
    score >= 75 ? "bg-green-50 border-green-200 text-green-700"
    : score >= 50 ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-red-50 border-red-200 text-red-700"

  if (prefersReduced) {
    return <span className={`font-medium border rounded-md ${cls} ${s}`}>{score}%</span>
  }

  return (
    <motion.span
      className={`inline-block font-medium border rounded-md ${cls} ${s}`}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={snappy}
    >
      {score}%
    </motion.span>
  )
}
