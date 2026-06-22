"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { fadeUp } from "@/lib/motion"
import type { ReactNode, CSSProperties } from "react"

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  variants?: Variants
  as?: "div" | "section" | "header" | "footer" | "article" | "ul" | "li"
  style?: CSSProperties
}

export function Reveal({ children, delay = 0, className, variants = fadeUp, as = "div", style }: RevealProps) {
  const prefersReduced = useReducedMotion()
  const MotionTag = motion[as]

  if (prefersReduced) {
    const Tag = as
    return <Tag className={className} style={style}>{children}</Tag>
  }

  return (
    <MotionTag
      className={className}
      style={style}
      initial="hidden"
      animate="show"
      variants={variants}
      transition={{ delay }}
    >
      {children}
    </MotionTag>
  )
}
