"use client"

import { useEffect } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Dashboard caught boundary failure:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center font-sans">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md shadow-xl space-y-4">
        <div className="h-12 w-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-500 mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            The dashboard encountered an unexpected error. Please try again or refresh the page.
          </p>
        </div>

        <button
          onClick={() => reset()}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-1.5 transition-all mx-auto shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Try Again
        </button>
      </div>
    </div>
  )
}
