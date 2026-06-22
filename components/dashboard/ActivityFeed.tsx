import { Match } from "@/types"
import { calculateDaysAgo } from "@/lib/utils"

interface ActivityFeedProps {
  recentMatches: Match[]
}

export function ActivityFeed({ recentMatches }: ActivityFeedProps) {
  const activities = recentMatches
    .filter((m) => m.status !== "skipped" && m.status !== "pending")
    .slice(0, 5)
    .map((match) => {
      const where = `${match.job?.title} at ${match.job?.company}`
      let text: string
      switch (match.status) {
        case "applied":   text = `Marked applied — ${where}`; break
        case "interview": text = `Moved to interview — ${where}`; break
        case "offer":     text = `Offer received — ${where}`; break
        case "rejected":  text = `Rejected — ${where}`; break
        case "reviewed":  text = `${match.match_score}% matched — ${where}`; break
        default:          text = `Matched — ${where}`
      }
      if (match.tailored_resume_json && match.status === "reviewed") {
        text = `Resume tailored for ${where}`
      }
      return { id: match.id, text, time: calculateDaysAgo(match.created_at) }
    })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-4">Recent activity</p>
      {activities.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No activity yet. Search for jobs to get started.</p>
      ) : (
        <div className="space-y-3">
          {activities.map(({ id, text, time }) => (
            <div key={id} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-700 leading-relaxed">{text}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{time}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
