"use client"

import { useState } from "react"
import { Loader2, KeyRound, Check, AlertTriangle, ExternalLink, Trash2 } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { CREDIT_COST, PLAN_CONFIG } from "@/lib/plans"
import { useAISettings, type AISettings } from "@/hooks/useAISettings"

type Notice = { type: "success" | "error"; message: string } | null

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.")
  return data as T
}

function ModeLine({ settings }: { settings: AISettings }) {
  const free = PLAN_CONFIG.free
  if (settings.mode === "byok" && settings.key) {
    return <p className="text-xs text-muted-foreground">Running on your {settings.key.provider_label} key. Smart Apply, tailoring and interview prep use no credits; your provider bills you for what you use.</p>
  }
  if (settings.mode === "hosted") {
    return <p className="text-xs text-muted-foreground">Running on JobAgent&apos;s hosted AI with your plan&apos;s credits.{settings.key ? " Turn on “Use my key” below to save your credits." : " You can also add your own key."}</p>
  }
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      You&apos;re on the free trial: {free.credits} hosted credits a month (Smart Apply costs {CREDIT_COST.smart_apply}) and {free.trialMatchPerRun} jobs scored per search.
      Add your own key to remove these limits. Groq and Gemini keys are free and take about two minutes to create.
    </p>
  )
}

export function AIProviderCard() {
  const { settings, setSettings, loading, error } = useAISettings()
  const [provider, setProvider] = useState("groq")
  const [apiKey, setApiKey] = useState("")
  const [models, setModels] = useState<string[]>([])
  const [fastModel, setFastModel] = useState<string | null>(null)
  const [qualityModel, setQualityModel] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (loading) {
    return <div id="ai" className="bg-card border border-border rounded-lg p-5 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  }
  if (!settings) {
    return <div id="ai" className="bg-card border border-border rounded-lg p-5 text-xs text-red-600">{error || "Couldn't load AI settings."}</div>
  }

  const key = settings.key
  const selected = settings.providers.find((p) => p.id === provider) ?? settings.providers[0]
  const fast = fastModel ?? key?.fast_model ?? ""
  const quality = qualityModel ?? key?.quality_model ?? ""
  const modelsChanged = !!key && (fast !== (key.fast_model ?? "") || quality !== (key.quality_model ?? ""))

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setNotice(null)
    try { await fn() } catch (err: unknown) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." })
    } finally { setBusy(null) }
  }

  const saveKey = (e: React.FormEvent) => {
    e.preventDefault()
    run("save", async () => {
      const data = await call<AISettings & { models: string[] }>("/api/ai/key", {
        method: "POST", body: JSON.stringify({ provider, api_key: apiKey.trim() }),
      })
      setSettings(data); setModels(data.models); setApiKey("")
      setFastModel(null); setQualityModel(null)
      setNotice({ type: "success", message: `Key saved. JobAgent picked ${data.key?.fast_model} for scoring and ${data.key?.quality_model} for writing; change them below if you like.` })
    })
  }

  const loadModels = () => run("models", async () => {
    const data = await call<{ models: string[] }>("/api/ai/models")
    setModels(data.models)
  })

  const patch = (body: Record<string, unknown>, message?: string) => run("patch", async () => {
    const data = await call<AISettings>("/api/ai/settings", { method: "PATCH", body: JSON.stringify(body) })
    setSettings(data); setFastModel(null); setQualityModel(null)
    if (message) setNotice({ type: "success", message })
  })

  const test = () => run("test", async () => {
    await call("/api/ai/test", { method: "POST" })
    setSettings({ ...settings, key: key ? { ...key, status: "valid", last_error: null } : key })
    setNotice({ type: "success", message: "Both models answered. You're all set." })
  })

  const remove = () => run("remove", async () => {
    const data = await call<AISettings>("/api/ai/key", { method: "DELETE" })
    setSettings(data); setModels([]); setConfirmRemove(false)
    setNotice({ type: "success", message: "Key removed. It's deleted from JobAgent." })
  })

  const inputCls = "w-full border border-border rounded-md py-2 px-3 text-base sm:text-sm text-foreground bg-card placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
  const labelCls = "block text-xs text-muted-foreground mb-1.5"
  const btn = "text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"

  return (
    <section id="ai" className="bg-card border border-border rounded-lg p-5 space-y-4 scroll-mt-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> AI provider</p>
        <ModeLine settings={settings} />
      </div>

      {notice && (
        <div className={`p-2.5 rounded-md text-xs border flex items-start gap-2 ${notice.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {notice.type === "success" ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{notice.message}</span>
        </div>
      )}

      {key && (
        <div className="border border-border rounded-md p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-foreground">
              {key.provider_label} <span className="font-mono text-xs text-muted-foreground">{key.hint}</span>
            </div>
            {key.status === "valid"
              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Working</span>
              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Needs attention</span>}
          </div>
          {key.status === "invalid" && key.last_error && (
            <p className="text-xs text-red-700">{key.last_error} Add the key again below, or remove it.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ai-fast-model" className={labelCls}>Scoring model (fast, many calls)</label>
              <input id="ai-fast-model" list="ai-models" value={fast} onChange={(e) => setFastModel(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="ai-quality-model" className={labelCls}>Writing model (resumes, letters, prep)</label>
              <input id="ai-quality-model" list="ai-models" value={quality} onChange={(e) => setQualityModel(e.target.value)} className={inputCls} />
            </div>
            <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>

          <div className="flex flex-wrap gap-2">
            {modelsChanged && (
              <button type="button" disabled={!!busy} onClick={() => patch({ fast_model: fast, quality_model: quality }, "Models saved.")}
                className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}>
                {busy === "patch" && <Loader2 className="w-3 h-3 animate-spin" />} Save models
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={test} className={`${btn} border border-border text-foreground/90 hover:border-foreground/40`}>
              {busy === "test" && <Loader2 className="w-3 h-3 animate-spin" />} Test key
            </button>
            {models.length === 0 && (
              <button type="button" disabled={!!busy} onClick={loadModels} className={`${btn} border border-border text-foreground/90 hover:border-foreground/40`}>
                {busy === "models" && <Loader2 className="w-3 h-3 animate-spin" />} Show available models
              </button>
            )}
          </div>

          <div className="space-y-2 pt-1">
            {settings.plan !== "free" && (
              <label className="flex items-start gap-2 text-xs text-foreground/90 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={key.use_own_key} disabled={!!busy}
                  onChange={(e) => patch({ use_own_key: e.target.checked })} />
                <span>Use my key instead of my plan&apos;s credits</span>
              </label>
            )}
            <label className="flex items-start gap-2 text-xs text-foreground/90 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={key.background_matching} disabled={!!busy}
                onChange={(e) => patch({ background_matching: e.target.checked })} />
              <span>Score new jobs for me every day on my key (about 20 short requests a day)</span>
            </label>
          </div>

          <div className="pt-1">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-foreground/90">Remove this key from JobAgent?</span>
                <button type="button" disabled={!!busy} onClick={remove} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                  {busy === "remove" && <Loader2 className="w-3 h-3 animate-spin" />} Remove key
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className={`${btn} border border-border`}>Keep it</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Remove key
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={saveKey} className="space-y-3">
        <p className="text-xs font-medium text-foreground">{key ? "Replace with a different key" : "Add your own key"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3">
          <div>
            <label htmlFor="ai-provider" className={labelCls}>Provider</label>
            <select id="ai-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
              {settings.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ai-key" className={labelCls}>API key</label>
            <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your key" className={inputCls} />
          </div>
        </div>
        {selected && (
          <p className="text-[11px] text-muted-foreground">
            {selected.note}{" "}
            <a href={selected.key_url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5 hover:text-foreground">
              Get a {selected.label} key <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </p>
        )}
        <button type="submit" disabled={!!busy || apiKey.trim().length < 10}
          className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}>
          {busy === "save" && <Loader2 className="w-3 h-3 animate-spin" />} Check and save key
        </button>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          JobAgent checks the key with the provider, then stores it encrypted. It&apos;s used only to run your own requests and is never shown again or shared. You can remove it any time.
        </p>
      </form>
    </section>
  )
}
