import { HfInference } from "@huggingface/inference"

if (!process.env.HUGGINGFACE_API_KEY) {
  console.warn("WARNING: HUGGINGFACE_API_KEY is not defined in environment variables.")
}

export const hf = new HfInference(process.env.HUGGINGFACE_API_KEY || "mock-key")

/**
 * Robust retry wrapper for Hugging Face API calls using exponential backoff.
 */
export async function callHuggingFace<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn()
  } catch (error: unknown) {
    if (retries <= 0) {
      throw error
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    console.warn(`Hugging Face call failed. Retrying in ${delay}ms... Error: ${errMsg}`)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return callHuggingFace(fn, retries - 1, delay * 2)
  }
}
