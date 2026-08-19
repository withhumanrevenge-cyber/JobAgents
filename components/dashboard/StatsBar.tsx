interface StatsBarProps {
  stats: {
    totalJobs: number
    matches: number
    applicationsSent: number
    interviews: number
  }
}

const CARDS = [
  { key: "totalJobs",        label: "Jobs in feed" },
  { key: "matches",          label: "Matched"      },
  { key: "applicationsSent", label: "Applied"      },
  { key: "interviews",       label: "Interviews"   },
] as const

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map(({ key, label }) => (
        <div key={key} className="bg-card border border-border rounded-lg p-4">
          <p className="text-2xl font-semibold text-foreground tabular-nums">{stats[key]}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}
