/**
 * /forgot-password — request a password reset link.
 *
 * Matches the /login editorial auth language (mono kicker, navy button, red
 * focus ring). Submitting a valid email POSTs to the request route and shows a
 * GENERIC confirmation state (enumeration-safe — identical whether or not the
 * account exists). Invalid/empty email shows inline validation and does NOT
 * call the API (AC-1.3).
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        // The route always returns the generic message (200) — even on
        // rate-limit or Supabase failure — so we always show confirmation.
        await res.json().catch(() => null);
        setSubmitted(true);
      } catch {
        // Network error — still show the generic confirmation (no enumeration).
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-[420px]">
            <div
              role="status"
              aria-live="polite"
              className="rounded-[20px] border border-gray-200 bg-white p-8 shadow-card text-center dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]"
            >
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-2 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-red" />
                Adroit Academy
              </div>
              <div className="w-[52px] h-[52px] rounded-2xl bg-emerald-light/60 border border-emerald/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6 text-emerald-700 dark:text-emerald-300"
                >
                  <path d="M22 6l-10 10L4 8" />
                  <path d="M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              </div>
              <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5 dark:text-[var(--ink-primary)]">
                Check your inbox
              </h1>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2 dark:text-[var(--ink-muted)]">
                If an account exists for <b className="text-gray-800 dark:text-[var(--ink-body)]">{email.trim()}</b>,
                we&rsquo;ve sent a reset link. Please allow a few minutes for it to arrive.
              </p>
              <p className="text-[12px] text-gray-500 leading-relaxed dark:text-[var(--ink-faint)]">
                Didn&rsquo;t get it? Check your spam folder, or{" "}
                <button
                  onClick={() => setSubmitted(false)}
                  className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red cursor-pointer bg-none border-none dark:text-[var(--ink-primary)]"
                >
                  try another email
                </button>
                .
              </p>
            </div>
            <p className="text-center mt-6">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline hover:text-navy transition-colors duration-150"
              >
                &larr; Back to sign in
              </Link>
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[420px]">
          <div className="rounded-[20px] border border-gray-200 bg-white p-8 shadow-card dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red" />
              Adroit Academy
            </div>
            <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5 dark:text-[var(--ink-primary)]">
              Forgot password
            </h1>
            <p className="text-[13px] text-gray-500 leading-relaxed mb-6 dark:text-[var(--ink-muted)]">
              Enter the email on your account and we&rsquo;ll send you a secure
              reset link. It&rsquo;s valid for <b className="text-gray-800 dark:text-[var(--ink-body)]">30 minutes</b>.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red/25 bg-red/5 px-4 py-3 text-[12.5px] text-red-dark mb-4 dark:bg-red/10 dark:text-[var(--accent-hover)]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.07em]">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby="emailHint"
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-800 placeholder:text-gray-500 focus:border-navy transition-colors duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-body)] dark:placeholder:text-[var(--ink-muted)]"
                  placeholder="you@company.com"
                />
              </label>
              <p id="emailHint" className="text-[11.5px] text-gray-500 -mt-2 dark:text-[var(--ink-faint)]">
                We&rsquo;ll only use this to send your reset link.
              </p>
              <button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-xl bg-navy text-white text-sm font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-wait"
              >
                {isPending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div className="mt-5 text-center text-[12.5px] text-gray-500">
              Remembered it?{" "}
              <Link
                href="/login"
                className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red no-underline"
              >
                Sign in
              </Link>
            </div>
          </div>

          <p className="text-center mt-6">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline hover:text-navy transition-colors duration-150"
            >
              &larr; Back to blog
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
