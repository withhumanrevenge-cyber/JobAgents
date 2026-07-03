"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { LayoutDashboard, Briefcase, FileCheck, Settings, LogOut, ShieldCheck, Building2, X } from "lucide-react"
import { spring } from "@/lib/motion"
import { useDashboardStore } from "@/store/dashboardStore"

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
  const [isAdmin, setIsAdmin] = useState(false)
  const sidebarOpen    = useDashboardStore((s) => s.sidebarOpen)
  const setSidebarOpen = useDashboardStore((s) => s.setSidebarOpen)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("profiles").select("is_admin").eq("user_id", user.id).single()
        .then(({ data }) => setIsAdmin(!!data?.is_admin))
    })
  }, [supabase])

  useEffect(() => { setSidebarOpen(false) }, [pathname, setSidebarOpen])

  useEffect(() => {
    if (sidebarOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = prev }
    }
  }, [sidebarOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-gray-900/40"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white border-r border-gray-100 transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-52 lg:translate-x-0 lg:shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">JobAgent</span>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden -mr-1 p-1.5 text-gray-400 hover:text-gray-900 rounded-md transition-colors"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
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

      <div className="px-2 py-3 border-t border-gray-100 space-y-0.5">
        <Link href="/hire"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
          <Building2 className="w-4 h-4 shrink-0 text-gray-400" />
          For employers
        </Link>
        {isAdmin && (
          <Link href="/admin"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
            <ShieldCheck className="w-4 h-4 shrink-0 text-gray-400" />
            Admin
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0 text-gray-400" />
          Sign out
        </button>
      </div>
      </aside>
    </>
  )
}
