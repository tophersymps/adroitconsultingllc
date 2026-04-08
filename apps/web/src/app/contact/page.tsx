"use client";

import { useState, type FormEvent } from "react";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ScrollReveal from "@/components/effects/ScrollReveal";
import { COMPANY } from "@/lib/constants";

const SERVICE_OPTIONS = [
  "Salesforce Consulting",
  "Business Process Automation",
  "Web Development",
  "Multi-Service Initiative",
];

const TIMELINE_OPTIONS = [
  "Immediate",
  "30-60 Days",
  "60-90 Days",
  "Planning Stage",
];

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-charcoal">
      {children}
      {required && <span className="ml-1 text-carmine">*</span>}
    </label>
  );
}

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-charcoal placeholder:text-gray-400 transition-colors focus:border-navy focus:ring-2 focus:ring-navy/20 focus:outline-none";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <>
      <HeroSection
        title="Let's Plan Your Next Transformation Initiative"
        subtitle="Share your goals and constraints. We'll respond with a focused recommendation and clear next steps."
        compact
      />

      <SectionContainer>
        <div className="mx-auto max-w-2xl">
          <ScrollReveal>
            <p className="text-lg leading-relaxed text-slate">
              Whether you are planning a Salesforce rollout, automation
              initiative, or website modernization, our team can help you define
              scope, priorities, and execution sequencing. Start the conversation
              below.
            </p>
          </ScrollReveal>

          {submitted ? (
            <ScrollReveal direction="none">
              <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-100 p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy/10 text-navy">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-charcoal">
                  Thank you for your inquiry
                </h3>
                <p className="mt-3 text-base text-slate">
                  We respond within one business day. Your information is handled
                  confidentially and used only to evaluate your inquiry.
                </p>
              </div>
            </ScrollReveal>
          ) : (
            <ScrollReveal delay={0.1}>
              <form onSubmit={handleSubmit} className="mt-12 space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="fullName" required>Full Name</FieldLabel>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required
                      className={inputClass}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="email" required>Work Email</FieldLabel>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className={inputClass}
                      placeholder="jane@company.com"
                    />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="company" required>Company</FieldLabel>
                    <input
                      id="company"
                      name="company"
                      type="text"
                      required
                      className={inputClass}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="role">Role / Title</FieldLabel>
                    <input
                      id="role"
                      name="role"
                      type="text"
                      className={inputClass}
                      placeholder="VP Operations"
                    />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="service" required>Service Interest</FieldLabel>
                    <select id="service" name="service" required className={inputClass}>
                      <option value="">Select a service</option>
                      {SERVICE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="timeline">Project Timeline</FieldLabel>
                    <select id="timeline" name="timeline" className={inputClass}>
                      <option value="">Select timeline</option>
                      {TIMELINE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="message">Message / Business Context</FieldLabel>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    className={inputClass}
                    placeholder="Describe your goals, current platform stack, and any constraints..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-carmine px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-carmine-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carmine sm:w-auto"
                >
                  Submit Inquiry
                </button>
              </form>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.2}>
            <div className="mt-10 space-y-2 text-sm text-gray-400">
              <p>We respond within one business day.</p>
              <p>
                Your information is handled confidentially and used only to
                evaluate your inquiry.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-100 p-8">
              <h3 className="text-lg font-semibold text-charcoal">
                Prefer direct outreach?
              </h3>
              <p className="mt-2 text-base text-slate">
                Email our consulting team at{" "}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="font-medium text-navy hover:underline"
                >
                  {COMPANY.email}
                </a>{" "}
                and include your current platform stack and timeline.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </SectionContainer>
    </>
  );
}
