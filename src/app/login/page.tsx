/**
 * /login — email/password sign in + sign up (Supabase).
 *
 * Design: matches the blog's editorial form language — mono kicker,
 * navy primary button, red focus ring. Session cookie is written by
 * the SSR client in /api/auth/login, so progress syncs across devices
 * after sign-in.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { notifyAuthChanged } from "@/lib/hooks/useAuth";
import { sanitizeRedirectPath } from "@/lib/redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow internal relative paths — reject external / protocol-relative
  // `next` values to prevent open-redirect (CWE-601).
  const next = sanitizeRedirectPath(searchParams.get("next"));

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setUnconfirmed(false);

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, email, password }),
        });
        const data = (await res.json()) as { status?: string; error?: string; message?: string };

        if (!res.ok) {
          // Friendly unconfirmed-email error (US-5): the server returns a
          // distinct 403 (never the raw GoTrue message, which would be a
          // no-op here) when the account exists but is unconfirmed. This is
          // the ONLY way to reach the resend-confirmation recovery path.
          if (mode === "signin" && res.status === 403) {
            setUnconfirmed(true);
            setError(
              "Your email hasn’t been confirmed yet. Check your inbox for the confirmation link, or resend it below.",
            );
          } else {
            setError(data.error ?? "Sign in failed. Please try again.");
          }
          return;
        }

        if (data.status === "check-email") {
          setInfo(data.message ?? "Check your inbox to confirm your email.");
          setMode("signin");
          setPassword("");
          return;
        }

        notifyAuthChanged();
        router.push(next);
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  function handleResend() {
    startTransition(async () => {
      try {
        await fetch("/api/auth/resend-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setInfo("If that account needs confirmation, we’ve sent a new link. Please allow a few minutes for it to arrive.");
        setUnconfirmed(false);
        setError(null);
      } catch {
        setError("Network error. Please try again.");
      }
    });
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
            {/* aria-live: the h1/subtitle/field semantics swap when the mode
                toggles — announce the change (WCAG 4.1.3) */}
            <div aria-live="polite">
              <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5">
                {mode === "signin" ? "Sign in" : "Create account"}
              </h1>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                {mode === "signin"
                  ? "Sign in to sync your reading progress, completions, and quiz scores across devices."
                  : "Create an account to save your progress and pick up where you left off on any device."}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red/25 bg-red/5 px-4 py-3 text-[12.5px] text-red-dark mb-4 dark:bg-red/10 dark:text-[var(--accent-hover)]"
              >
                {error}
                {unconfirmed && (
                  <div className="mt-2">
                    <button
                      onClick={handleResend}
                      disabled={isPending}
                      className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red cursor-pointer bg-none border-none text-[12.5px]"
                    >
                      Resend confirmation email
                    </button>
                  </div>
                )}
              </div>
            )}

            {info && (
              <div
                role="status"
                className="rounded-xl border border-emerald/25 bg-emerald-light/40 px-4 py-3 text-[12.5px] text-emerald-700 mb-4 dark:bg-emerald/15 dark:text-emerald-300"
              >
                {info}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.07em]">
                  Email
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-800 placeholder:text-gray-500 focus:border-navy transition-colors duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-body)] dark:placeholder:text-[var(--ink-muted)]"
                  placeholder="you@company.com"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.07em]">
                  Password
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-800 placeholder:text-gray-500 focus:border-navy transition-colors duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-body)] dark:placeholder:text-[var(--ink-muted)]"
                  placeholder="••••••••"
                />
              </label>

              {mode === "signin" && (
                <div className="flex justify-end -mt-2">
                  <Link
                    href="/forgot-password"
                    className="text-[12px] font-medium text-gray-500 no-underline hover:text-navy transition-colors duration-150"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-xl bg-navy text-white text-sm font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-wait"
              >
                {isPending
                  ? "Working…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            <div className="mt-5 text-center text-[12.5px] text-gray-500">
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <button
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setInfo(null);
                    }}
                    className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red cursor-pointer bg-none border-none"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setInfo(null);
                    }}
                    className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red cursor-pointer bg-none border-none"
                  >
                    Sign in
                  </button>
                </>
              )}
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <Header />
          <main id="main" className="flex-1 flex items-center justify-center">
            <div className="text-gray-500 text-sm">Loading…</div>
          </main>
          <Footer />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
