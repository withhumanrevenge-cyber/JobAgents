"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ShieldCheck, X } from "lucide-react"

interface ConsentModalProps {
  open: boolean
  title: string
  points: string[]
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConsentModal({ open, title, points, confirmLabel, onConfirm, onCancel }: ConsentModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            className="fixed inset-0 z-50 bg-gray-900/40"
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="pointer-events-auto w-full max-w-sm bg-white border border-gray-200 rounded-lg p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-gray-500 shrink-0" />
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                </div>
                <button onClick={onCancel} aria-label="Close"
                  className="-mr-1 -mt-1 p-1 text-gray-400 hover:text-gray-900 rounded-md transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ul className="space-y-2 mb-4">
                {points.map((p) => (
                  <li key={p} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                    <span className="text-gray-300 shrink-0">•</span>{p}
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <button onClick={onCancel}
                  className="flex-1 border border-gray-200 text-gray-700 text-xs font-medium py-2 rounded-md hover:border-gray-400 transition-colors">
                  Cancel
                </button>
                <button onClick={onConfirm}
                  className="flex-1 bg-gray-900 text-white text-xs font-medium py-2 rounded-md hover:bg-gray-700 transition-colors">
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
