import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "JobAgent — AI jobs matched to your resume",
  description: "Upload your resume once. We pull jobs from across the web, score each one against your background, and prep a tailored resume, cover letter, and interview questions for the ones that fit.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} font-sans min-h-screen bg-white text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  )
}
