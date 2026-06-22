"use client"

import { motion, useReducedMotion } from "framer-motion"
import { staggerParent, fadeUp } from "@/lib/motion"
import type { ReactNode } from "react"

interface StaggerProps {
  children: ReactNode
  className?: string
  as?: "div" | "ul" | "tbody" | "section"
}

export function Stagger({ children, className, as = "div" }: StaggerProps) {
  const prefersReduced = useReducedMotion()
  const MotionTag = motion[as]

  if (prefersReduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag className={className} initial="hidden" animate="show" variants={staggerParent}>
      {children}
    </MotionTag>
  )
}

interface StaggerItemProps {
  children: ReactNode
  className?: string
  as?: "div" | "li" | "tr"
}

export function StaggerItem({ children, className, as = "div" }: StaggerItemProps) {
  const prefersReduced = useReducedMotion()
  const MotionTag = motion[as]

  if (prefersReduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <MotionTag className={className} variants={fadeUp}>
      {children}
    </MotionTag>
  )
}
