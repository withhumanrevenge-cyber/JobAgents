"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { LayoutDashboard, Briefcase, FileCheck, Settings, LogOut } from "lucide-react"
import { spring } from "@/lib/motion"

const NAV = [
  { href: "/dashboard",    icon: LayoutDashboard, label: "Dashboard" },
  { href: "/jobs",         icon: Briefcase,        label: "Jobs" },
  { href: "/applications", icon: FileCheck,        label: "Applications" },
  { href: "/settings",     icon: Settings,         label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const prefersReduced = useReducedMotion()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <aside className="w-52 h-full flex flex-col bg-white border-r border-gray-100 shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">JobAgent</span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {active && !prefersReduced && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 bg-gray-100 rounded-md -z-10"
                  transition={spring}
                />
              )}
              {active && prefersReduced && (
                <span className="absolute inset-0 bg-gray-100 rounded-md -z-10" />
              )}
              <Icon className={`w-4 h-4 shrink-0 relative ${active ? "text-gray-900" : "text-gray-400"}`} />
              <span className="relative">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-2 py-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0 text-gray-400" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
