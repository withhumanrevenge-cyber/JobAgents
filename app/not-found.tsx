import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-8xl font-bold text-gray-100 mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 mb-8">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-700 transition-colors">
            Go home
          </Link>
          <Link href="/dashboard" className="border border-gray-200 text-sm text-gray-700 px-4 py-2 rounded-md hover:border-gray-400 transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
