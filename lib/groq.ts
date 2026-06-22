import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" })

const MODEL = "llama-3.3-70b-versatile"

export async function callGroq(prompt: string, systemInstruction?: string): Promise<string> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = []
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction })
  messages.push({ role: "user", content: prompt })

  const completion = await groq.chat.completions.create({ model: MODEL, messages, temperature: 0.3 })
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
