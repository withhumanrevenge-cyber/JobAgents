import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "")

export async function callGemini(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    ...(systemInstruction ? { systemInstruction } : {}),
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

export async function callGeminiWithPdf(
  pdfBase64: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    ...(systemInstruction ? { systemInstruction } : {}),
  })
  const result = await model.generateContent([
    { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
    { text: prompt },
  ])
  return result.response.text()
}

export function parseJsonFromGemini<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim()
    return JSON.parse(cleaned) as T
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { return null }
    }
    return null
  }
}
