import React from "react"
import Link from "next/link"
import { Reveal } from "@/components/motion/Reveal"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="text-sm font-semibold text-gray-900">JobAgent</Link>
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
