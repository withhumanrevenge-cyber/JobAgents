import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callGroq, parseJsonFromGroq } from "@/lib/groq"
import { ParsedResume } from "@/types"
import { PDFParse } from "pdf-parse"

const SYSTEM_PROMPT = `You are an expert resume parser. Extract all relevant information from the resume text below.
Return ONLY a valid JSON object in this exact shape — no markdown, no extra text:
{
  "name": "<full name>",
  "email": "<email address>",
  "phone": "<phone number>",
  "target_role": "<the job title/role this person is targeting, inferred from their most recent title and experience>",
  "years_experience": <integer — total years of professional experience>,
  "summary": "<professional summary or objective, 2-3 sentences>",
  "skills": ["<skill1>", "<skill2>", ...],
  "experience": [
    {
      "company": "<company name>",
      "title": "<job title>",
      "dates": "<start - end dates>",
      "bullets": ["<responsibility or achievement>", ...]
    }
  ],
  "education": [
    {
      "school": "<school name>",
      "degree": "<degree and field>",
      "year": "<graduation year>"
    }
  ],
  "certifications": ["<cert name>", ...],
  "projects": [
    {
      "name": "<project name>",
      "description": "<what it does>",
      "tech": ["<tech used>"],
      "url": "<url if present>"
    }
  ]
}
If a field is not present in the resume, use an empty string or empty array. Do not invent data.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("resume") as File | null

    if (!file) return NextResponse.json({ error: "No resume file provided." }, { status: 400 })
    if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF resumes are supported." }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Resume must be under 10MB." }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const pdfData = new Uint8Array(bytes)

    let resumeText = ""
    const parser = new PDFParse({ data: pdfData })
    try {
      const result = await parser.getText()
      resumeText = result.text?.trim() || ""
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error("PDF text extraction failed:", detail)
      return NextResponse.json(
        { error: `Could not read PDF: ${detail}. Make sure the file contains selectable text (not a scanned image).` },
        { status: 422 }
      )
    } finally {
      await parser.destroy().catch(() => {})
    }

    if (!resumeText || resumeText.length < 50) {
      return NextResponse.json({ error: "Resume appears to be a scanned image. Please use a text-based PDF." }, { status: 422 })
    }

    const filePath = `${user.id}/resume_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, file, { upsert: true, contentType: "application/pdf" })

    if (uploadError) console.warn("Storage upload failed:", uploadError.message)

    const publicUrl = supabase.storage.from("resumes").getPublicUrl(filePath).data.publicUrl

    const rawText = await callGroq(
      `Extract all information from this resume:\n\n${resumeText.slice(0, 6000)}`,
      SYSTEM_PROMPT
    )
    const parsedResume = parseJsonFromGroq<ParsedResume>(rawText)

    if (!parsedResume || !parsedResume.name) {
      return NextResponse.json(
        { error: "Could not parse resume. Please ensure the PDF contains readable text." },
        { status: 422 }
      )
    }

    await supabase
      .from("profiles")
      .update({
        parsed_resume: parsedResume,
        resume_parsed_at: new Date().toISOString(),
        base_resume_url: publicUrl,
        full_name: parsedResume.name || undefined,
        email: parsedResume.email || undefined,
        phone: parsedResume.phone || undefined,
      })
      .eq("user_id", user.id)

    return NextResponse.json({ parsed_resume: parsedResume, resume_url: publicUrl })
  } catch (err: unknown) {
    console.error("Resume parse error:", err)
    const msg = err instanceof Error ? err.message : "Failed to parse resume."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
