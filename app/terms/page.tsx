import type { Metadata } from "next"
import Link from "next/link"
import { LegalShell, LegalSection } from "@/components/legal/LegalShell"

export const metadata: Metadata = {
  title: "Terms of Service — JobAgent",
  description: "The terms governing your use of JobAgent.",
}

const CONTACT = "withhumanrevenge@gmail.com"

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="June 28, 2026">
      <p className="text-sm text-foreground/80 leading-relaxed">
        These Terms of Service (&quot;Terms&quot;) govern your use of JobAgent. By creating an account or using the
        service, you agree to these Terms. If you do not agree, do not use JobAgent.
      </p>

      <LegalSection heading="1. The service">
        <p>
          JobAgent is a job-search assistant. You upload a resume; we fetch jobs from third-party sources, score them
          against your background, and can generate tailored resumes, cover letters, and interview questions. JobAgent
          is a tool to help your search — it is not a recruiter or employer.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts">
        <p>
          You must provide accurate information and are responsible for activity under your account. You must be at
          least 16 years old to use JobAgent.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <ul className="list-disc pl-5 space-y-1">
          <li>Do not use the service for any unlawful purpose or to upload content you do not have the right to share.</li>
          <li>Do not attempt to disrupt, abuse, scrape, or overload the service or its APIs.</li>
          <li>Do not resell or redistribute the service without permission.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Plans, billing, and renewals">
        <p>
          JobAgent offers a Free plan and paid plans (Pro and Premium), billed monthly. Paid plans renew automatically
          until cancelled. Payments are processed by Razorpay (for customers in India) or Lemon Squeezy (international),
          who act as our payment processors; Lemon Squeezy is the merchant of record for international sales. Prices are
          shown at checkout and may be in USD or INR depending on your region.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cancellation and refunds">
        <p>
          You can cancel at any time; your paid features remain active until the end of the current billing period, and
          you will not be charged again. Because the service grants access to AI features immediately, paid subscription
          fees are generally non-refundable except where required by law. If you believe you were charged in error,
          contact us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-2">{CONTACT}</a> and we will
          review it in good faith.
        </p>
      </LegalSection>

      <LegalSection heading="6. Credits and fair use">
        <p>
          Paid AI actions (Smart Apply, resume tailoring, interview prep) consume monthly credits as described on the
          pricing page. Credits reset each billing cycle and do not roll over. We may apply reasonable limits to prevent
          abuse.
        </p>
      </LegalSection>

      <LegalSection heading="7. No guarantee of results">
        <p>
          JobAgent does not guarantee that you will receive interviews or job offers. We do not submit job applications
          on your behalf — you apply on the original employer&apos;s site. AI-generated content (resumes, cover letters,
          scores, interview questions) may contain errors or inaccuracies; you are responsible for reviewing it before
          use. Job listings come from third-party sources and we do not guarantee their accuracy or availability.
        </p>
      </LegalSection>

      <LegalSection heading="8. Intellectual property">
        <p>
          You retain ownership of your resume and the content you upload. You grant us a limited license to process that
          content solely to provide the service. The JobAgent software, branding, and design remain our property.
        </p>
      </LegalSection>

      <LegalSection heading="9. Disclaimers and limitation of liability">
        <p>
          The service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by
          law, JobAgent is not liable for any indirect, incidental, or consequential damages, or for any lost
          opportunities, arising from your use of the service. Our total liability for any claim is limited to the
          amount you paid us in the 12 months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="10. Termination">
        <p>
          You may stop using JobAgent at any time. We may suspend or terminate accounts that violate these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Continued use after changes means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-2">{CONTACT}</a>. See also our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
