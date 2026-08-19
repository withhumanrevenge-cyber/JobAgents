import React from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { Reveal } from "@/components/motion/Reveal"

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/" className="text-sm font-semibold text-foreground">JobAgent</Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Reveal className="w-full max-w-sm">
          {children}
        </Reveal>
      </div>
    </div>
  )
}
