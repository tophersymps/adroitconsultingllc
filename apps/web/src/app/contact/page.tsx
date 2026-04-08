"use client";

import { useEffect, useState, type FormEvent } from "react";
import Script from "next/script";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ScrollReveal from "@/components/effects/ScrollReveal";
import { COMPANY } from "@/lib/constants";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const SERVICE_OPTIONS = [
  "Platform & CRM Strategy",
  "Operational Intelligence",
  "Digital Experience",
  "AI & Agentforce",
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

type Status = "idle" | "submitting" | "success" | "error";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [recaptchaReady, setRecaptchaReady] = useState(false);

  useEffect(() => {
    if (window.grecaptcha) setRecaptchaReady(true);
  }, []);

  function onRecaptchaLoad() {
    setRecaptchaReady(true);
  }

  async function getRecaptchaToken(): Promise<string | null> {
    if (!RECAPTCHA_SITE_KEY || !window.grecaptcha) return null;
    return new Promise((resolve) => {
      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, {
            action: "contact_submit",
          });
          resolve(token);
        } catch {
          resolve(null);
        }
      });
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;

    const recaptchaToken = await getRecaptchaToken();
    if (RECAPTCHA_SITE_KEY && !recaptchaToken) {
      setErrorMsg("reCAPTCHA verification failed. Please refresh and try again.");
      setStatus("error");
      return;
    }

    const data = {
      fullName: (form.elements.namedItem("fullName") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      company: (form.elements.namedItem("company") as HTMLInputElement).value,
      role: (form.elements.namedItem("role") as HTMLInputElement).value,
      service: (form.elements.namedItem("service") as HTMLSelectElement).value,
      timeline: (form.elements.namedItem("timeline") as HTMLSelectElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
      website: (form.elements.namedItem("website") as HTMLInputElement).value,
      recaptchaToken: recaptchaToken ?? undefined,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMsg(json.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMsg(
        "Unable to reach the server. Please check your connection and try again.",
      );
      setStatus("error");
    }
  }

  const isSubmitting = status === "submitting";

  return (
    <>
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          onLoad={onRecaptchaLoad}
        />
      )}
      <HeroSection
        title="Let's Plan Your Next Transformation Initiative"
        subtitle="Share your goals and constraints. We'll respond with a focused recommendation and clear next steps."
        compact
      />

      <SectionContainer>
        <div className="mx-auto max-w-2xl">
          <ScrollReveal>
            <p className="text-lg leading-relaxed text-slate">
              Whether you are planning a CRM transformation, automation
              initiative, AI adoption, or digital experience modernization, our
              team can help you define scope, priorities, and execution
              sequencing. Start the conversation below.
            </p>
          </ScrollReveal>

          {status === "success" ? (
            <ScrollReveal direction="none">
              <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-100 p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy/10 text-navy">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-charcoal">
                  Thank you for your inquiry
                </h2>
                <p className="mt-3 text-base text-slate">
                  We respond within one business day. Your information is handled
                  confidentially and used only to evaluate your inquiry.
                </p>
              </div>
            </ScrollReveal>
          ) : (
            <ScrollReveal delay={0.1}>
              <form onSubmit={handleSubmit} className="mt-12 space-y-6">
                {/* Honeypot -- invisible to humans, bots fill it in */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="fullName" required>Full Name</FieldLabel>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                      className={inputClass}
                      placeholder="VP Operations"
                    />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="service" required>Service Interest</FieldLabel>
                    <select id="service" name="service" required disabled={isSubmitting} className={inputClass}>
                      <option value="">Select a service</option>
                      {SERVICE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="timeline">Project Timeline</FieldLabel>
                    <select id="timeline" name="timeline" disabled={isSubmitting} className={inputClass}>
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
                    disabled={isSubmitting}
                    className={inputClass}
                    placeholder="Describe your goals, current platform stack, and any constraints..."
                  />
                </div>

                {status === "error" && (
                  <div className="rounded-lg border border-carmine/20 bg-carmine/5 px-4 py-3 text-sm text-carmine">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-carmine px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-carmine-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carmine disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
                >
                  {isSubmitting && (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {isSubmitting ? "Submitting..." : "Submit Inquiry"}
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
              <h2 className="text-lg font-semibold text-charcoal">
                Prefer direct outreach?
              </h2>
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
