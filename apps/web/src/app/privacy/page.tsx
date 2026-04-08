import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Adroit Consulting collects, uses, and protects your information.",
};

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 text-xl font-semibold text-charcoal first:mt-0">
      {children}
    </h2>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-slate">{children}</p>;
}

export default function Privacy() {
  return (
    <>
      <HeroSection
        title="Privacy Policy"
        subtitle="How we collect, use, and protect your information."
        compact
      />

      <SectionContainer>
        <div className="prose-slate mx-auto max-w-3xl">
          <Para>
            Adroit Consulting (&quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;) respects your privacy and is committed to
            protecting the personal information you share with us. This policy
            explains what data we collect, why we collect it, and how we handle
            it when you visit our website or submit an inquiry.
          </Para>

          <Heading>Information We Collect</Heading>
          <Para>
            We collect information you voluntarily provide through our contact
            form, including your name, email address, company name, job title,
            service interest, project timeline, and any additional context you
            include in your message. We do not collect sensitive personal data
            such as financial information, government identifiers, or health
            data.
          </Para>
          <Para>
            We also collect limited technical data automatically when you visit
            our site, including your IP address, browser type, device type,
            pages visited, and referring URL. This data is collected through
            cookies and analytics tools only when you provide consent.
          </Para>

          <Heading>How We Use Your Information</Heading>
          <Para>
            Contact form submissions are used solely to evaluate your inquiry
            and respond with relevant information about our consulting services.
            Your information is forwarded to our customer relationship
            management system (Salesforce) for lead tracking and follow-up.
          </Para>
          <Para>
            Analytics data, when consent is given, helps us understand how
            visitors interact with our site so we can improve content and user
            experience. We do not sell, rent, or share your personal information
            with third parties for marketing purposes.
          </Para>

          <Heading>Cookies and Tracking</Heading>
          <Para>
            Our site uses cookies for the following purposes, each activated
            only after you grant consent via the cookie banner:
          </Para>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-slate">
            <li>
              <strong>Google Analytics (GA4)</strong> &mdash; measures site
              traffic and usage patterns. Data is anonymized (IP anonymization
              enabled).
            </li>
            <li>
              <strong>Google reCAPTCHA v3</strong> &mdash; protects our contact
              form from spam and abuse. reCAPTCHA may set cookies and collect
              usage data subject to{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-navy underline"
              >
                Google&apos;s Privacy Policy
              </a>
              .
            </li>
          </ul>
          <Para>
            You can withdraw consent at any time by clearing your browser
            cookies and revisiting the site; the consent banner will reappear.
          </Para>

          <Heading>Third-Party Services</Heading>
          <Para>We use the following third-party services to operate our site:</Para>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-slate">
            <li>
              <strong>Salesforce</strong> &mdash; stores contact form
              submissions as leads for follow-up.
            </li>
            <li>
              <strong>Google Analytics</strong> &mdash; website usage analytics
              (consent-gated).
            </li>
            <li>
              <strong>Google reCAPTCHA</strong> &mdash; bot and spam protection
              on the contact form.
            </li>
            <li>
              <strong>Vercel</strong> &mdash; website hosting and delivery.
            </li>
          </ul>
          <Para>
            Each service processes data under its own privacy policy. We
            recommend reviewing those policies for complete details.
          </Para>

          <Heading>Data Retention</Heading>
          <Para>
            Contact form submissions are retained in Salesforce for the duration
            of our business relationship or until you request deletion.
            Analytics data is retained according to Google Analytics default
            settings (currently 14 months) and cannot be used to identify you
            personally.
          </Para>

          <Heading>Your Rights</Heading>
          <Para>
            Depending on your jurisdiction, you may have the right to access,
            correct, or delete personal data we hold about you; restrict or
            object to processing; and data portability. To exercise any of
            these rights, contact us at the address below.
          </Para>

          <Heading>Security</Heading>
          <Para>
            We use industry-standard security measures including HTTPS
            encryption, server-side validation, rate limiting, and reCAPTCHA
            verification to protect your data in transit and at rest.
          </Para>

          <Heading>Changes to This Policy</Heading>
          <Para>
            We may update this policy periodically. Material changes will be
            posted on this page with an updated effective date.
          </Para>

          <Heading>Contact</Heading>
          <Para>
            For privacy-related questions or data requests, email us at{" "}
            <a
              href={`mailto:${COMPANY.email}`}
              className="font-medium text-navy underline"
            >
              {COMPANY.email}
            </a>
            .
          </Para>

          <p className="mt-12 text-sm text-gray-400">
            Effective date: April 2026
          </p>
        </div>
      </SectionContainer>
    </>
  );
}
