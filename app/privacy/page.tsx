import type { Metadata } from "next"
import { LegalShell, LegalSection } from "@/components/legal/LegalShell"

export const metadata: Metadata = {
  title: "Privacy Policy — JobAgent",
  description: "How JobAgent collects, uses, and protects your data.",
}

const CONTACT = "withhumanrevenge@gmail.com"

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 28, 2026">
      <p className="text-sm text-foreground/80 leading-relaxed">
        This Privacy Policy explains how JobAgent (&quot;we&quot;, &quot;us&quot;) collects, uses, and protects your
        information when you use our website and services. By using JobAgent, you agree to this policy.
      </p>

      <LegalSection heading="1. Information we collect">
        <p>We collect the following to provide the service:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account details</strong> — name, email address, and (optionally) phone number and LinkedIn URL.</li>
          <li><strong>Your resume</strong> — the PDF you upload and the structured data we extract from it (skills, work history, education, target role).</li>
          <li><strong>Preferences</strong> — target roles, target country, and match threshold.</li>
          <li><strong>Usage data</strong> — actions you take (e.g. AI features used) and basic technical logs.</li>
          <li><strong>Payment data</strong> — handled entirely by our payment processors. We never see or store your full card details.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Parse your resume and score jobs against your background.</li>
          <li>Generate tailored resumes, cover letters, and interview questions on your request.</li>
          <li>Fetch and personalize job listings to your target role and country.</li>
          <li>Send you email digests of new matches (if you opt in).</li>
          <li>Operate, secure, and improve the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Third-party services">
        <p>We share data with these providers only as needed to run JobAgent. We do <strong>not</strong> sell your data.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Supabase</strong> — authentication, database, and resume file storage.</li>
          <li><strong>Groq</strong> — AI processing. Your resume text and job descriptions are sent to Groq to parse, score, and generate documents.</li>
          <li><strong>Remotive, Adzuna, JSearch</strong> — job sources. We send only your search terms (role, country), never your resume.</li>
          <li><strong>Resend</strong> — sending email digests.</li>
          <li><strong>Razorpay</strong> and <strong>Lemon Squeezy</strong> — payment processing for paid plans.</li>
          <li><strong>Google</strong> — optional sign-in (OAuth). We receive your name and email.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. AI processing">
        <p>
          To power matching and document generation, the text of your resume and selected job listings is sent to our
          AI provider (Groq). This data is used to produce your results and is not used by us to train models.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data retention and deletion">
        <p>
          We keep your data for as long as your account is active. You can edit your profile and re-upload your resume
          at any time in Settings. To delete your account and associated data, email us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-2">{CONTACT}</a> and we will
          remove it within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          Data is transmitted over encrypted connections (HTTPS) and access to your records is restricted by
          row-level security so each user can only access their own data. No method of transmission or storage is
          100% secure, but we take reasonable measures to protect your information.
        </p>
      </LegalSection>

      <LegalSection heading="7. Cookies">
        <p>
          We use only essential cookies required to keep you signed in. We do not use advertising or third-party
          tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <p>
          You may access and correct your information in Settings, request a copy of your data, or request deletion at
          any time by contacting us. Depending on your location, you may have additional rights under laws such as the
          GDPR or India&apos;s DPDP Act.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>JobAgent is not directed to anyone under 16, and we do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by the &quot;Last updated&quot;
          date above.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about your privacy? Email{" "}
          <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-2">{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
