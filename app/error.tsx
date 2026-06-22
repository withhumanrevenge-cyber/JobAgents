"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          An unexpected error occurred. Please try again, or contact support if it persists.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-700 transition-colors">
            Try again
          </button>
          <a href="/" className="border border-gray-200 text-sm text-gray-700 px-4 py-2 rounded-md hover:border-gray-400 transition-colors">
            Go home
          </a>
        </div>
        {error.digest && <p className="mt-4 text-[10px] text-gray-400 font-mono">Error ID: {error.digest}</p>}
      </div>
    </div>
  )
}
