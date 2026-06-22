"use client"

import { useState, useRef, KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { spring } from "@/lib/motion"

interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  maxTags?: number
  helperText?: string
}

export function TagInput({ value, onChange, placeholder = "Type a role and press Enter", maxTags = 5, helperText }: TagInputProps) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "")
    if (!tag) return
    if (value.includes(tag)) { setDraft(""); return }
    if (value.length >= maxTags) return
    onChange([...value, tag])
    setDraft("")
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
    inputRef.current?.focus()
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(draft)
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const atMax = value.length >= maxTags

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap gap-1.5 border border-gray-200 rounded-md px-2 py-2 min-h-[42px] cursor-text focus-within:border-gray-900 transition-colors"
      >
        <AnimatePresence initial={false}>
          {value.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={spring}
              className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 text-xs text-gray-800 pl-2 pr-1 py-1 rounded"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                className="w-3.5 h-3.5 rounded hover:bg-gray-300 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => draft && addTag(draft)}
          disabled={atMax}
          placeholder={value.length === 0 ? placeholder : atMax ? `Max ${maxTags} reached` : "Add another..."}
          className="flex-1 min-w-[120px] bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none disabled:cursor-not-allowed"
        />
      </div>
      {helperText && <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{helperText}</p>}
    </div>
  )
}
