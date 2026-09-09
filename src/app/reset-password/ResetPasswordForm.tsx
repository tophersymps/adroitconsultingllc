/**
 * /reset-password — new-password form (client component).
 *
 * Rendered ONLY after the server-side gate in page.tsx confirms an authed
 * session (see the t_4fbc8f48 finding: the SSR HTML previously leaked the
 * form to guests because the gate was client-only). The useAuth check below
 * stays as a defensive backstop only.
 *
 * Handles: form validation (min 6, match), POST /api/auth/reset-password/update,
 * success state with "Continue to blog" (ADR-PWR-2).
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth, notifyAuthChanged } from "@/lib/hooks/useAuth";

export default function ResetPasswordForm() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Defensive backstop (the server gate in page.tsx is the primary guard).
  if (!isLoading && !user) {
    router.replace("/login?next=/reset-password");
    return null;
  }

  if (success) {
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
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6 text-emerald-700 dark:text-emerald-300"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5 dark:text-[var(--ink-primary)]">
                Password updated
              </h1>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6 dark:text-[var(--ink-muted)]">
                All set. Your password has been changed, and you&rsquo;re signed in on this device.
              </p>
              <Link
                href="/blog"
                className="block h-11 rounded-xl bg-navy text-white text-sm font-bold text-center leading-[2.75rem] no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
              >
                Continue to blog &rarr;
              </Link>
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (password.length < 6) {
      setFieldError("Must be at least 6 characters.");
      return;
    }
    if (confirm !== password) {
      setFieldError("Passwords don\u2019t match.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!res.ok) {
          setError(data?.error ?? "Couldn\u2019t update your password. Please try again.");
          return;
        }

        notifyAuthChanged();
        setSuccess(true);
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
            <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5 dark:text-[var(--ink-primary)]">
              Set a new password
            </h1>
            <p className="text-[13px] text-gray-500 leading-relaxed mb-6 dark:text-[var(--ink-muted)]">
              Choose a password you haven&rsquo;t used here before. Use at least{" "}
              <b className="text-gray-800 dark:text-[var(--ink-body)]">6 characters</b>.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red/25 bg-red/5 px-4 py-3 text-[12.5px] text-red-dark mb-4 dark:bg-red/10 dark:text-[var(--accent-hover)]"
              >
                {error}
              </div>
            )}
            {fieldError && (
              <div
                role="alert"
                className="rounded-xl border border-red/25 bg-red/5 px-4 py-3 text-[12.5px] text-red-dark mb-4 dark:bg-red/10 dark:text-[var(--accent-hover)]"
              >
                {fieldError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.07em]">
                  New password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-800 placeholder:text-gray-500 focus:border-navy transition-colors duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-body)] dark:placeholder:text-[var(--ink-muted)]"
                  placeholder="••••••••"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-bold text-gray-500 uppercase tracking-[0.07em]">
                  Confirm password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-800 placeholder:text-gray-500 focus:border-navy transition-colors duration-150 dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-body)] dark:placeholder:text-[var(--ink-muted)]"
                  placeholder="••••••••"
                />
              </label>
              <p className="text-[11.5px] text-gray-500 -mt-2 dark:text-[var(--ink-faint)]">
                At least 6 characters, and make sure both match.
              </p>
              <button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-xl bg-navy text-white text-sm font-bold cursor-pointer hover:bg-navy-light active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-wait"
              >
                {isPending ? "Updating…" : "Update password"}
              </button>
            </form>
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
