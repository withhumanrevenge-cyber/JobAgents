// Opens the signed-in user's stored resume in a new tab via a short-lived signed URL.
// The tab is opened synchronously with the click so popup blockers don't swallow it, then
// pointed at the signed URL once the API responds.
export async function openStoredResume(): Promise<{ ok: boolean; error?: string }> {
  const tab = typeof window !== "undefined" ? window.open("", "_blank") : null
  try {
    const res = await fetch("/api/resume/url")
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) {
      tab?.close()
      return { ok: false, error: data.error || "Could not open resume." }
    }
    if (tab) tab.location.href = data.url
    else window.location.href = data.url
    return { ok: true }
  } catch {
    tab?.close()
    return { ok: false, error: "Could not open resume." }
  }
}
