import Anthropic from "@anthropic-ai/sdk"

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set.")
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function callClaude(
  messages: Anthropic.MessageParam[],
  systemPrompt?: string,
  options: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const response = await anthropic.messages.create({
    model: options.model || "claude-haiku-4-5-20251001",
    max_tokens: options.maxTokens || 1000,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  })
  const block = response.content[0]
  return block.type === "text" ? block.text : ""
}

export function parseJsonFromClaude<T = unknown>(text: string): T | null {
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    return JSON.parse(match ? match[0] : text) as T
  } catch {
    return null
  }
}
