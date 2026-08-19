import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-card flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-8xl font-bold text-muted-foreground/40 mb-4">404</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-colors">
            Go home
          </Link>
          <Link href="/dashboard" className="border border-border text-sm text-foreground/90 px-4 py-2 rounded-md hover:border-foreground/40 transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
