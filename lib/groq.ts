import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" })

export const MODEL = "openai/gpt-oss-120b"
export const FAST_MODEL = "openai/gpt-oss-20b"

export async function callGroq(
  prompt: string,
  systemInstruction?: string,
  options: { model?: string; meterUserId?: string; maxTokens?: number } = {}
): Promise<string> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = []
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction })
  messages.push({ role: "user", content: prompt })

  const model = options.model || MODEL
  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    max_tokens: options.maxTokens ?? 2048,
  })

  if (options.meterUserId && completion.usage?.total_tokens) {
    import("@/lib/usage")
      .then((m) => m.logTokens(options.meterUserId!, completion.usage!.total_tokens, model))
      .catch(() => {})
  }

  return completion.choices[0]?.message?.content ?? ""
}

export function parseJsonFromGroq<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim()
    return JSON.parse(cleaned) as T
  } catch {
    const match = text.match(/[\[{][\s\S]*[\]}]/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { return null }
    }
    return null
  }
}
