/**
 * /reset-password — set a new password with a reset token (Managed Better Auth).
 *
 * SERVER component. Two ways to be allowed in, both server-side:
 *   1. `?token=…` — the single-use token from the reset email is the
 *      credential. Legacy/imported users are signed OUT and still must be able
 *      to reset, so the token path renders the form for guests.
 *   2. No token, but an authed session — the old session-gated path is kept
 *      for anyone who lands here signed in.
 * Anything else redirects to /login BEFORE the form markup is emitted, so the
 * sensitive form is never in the SSR HTML for an unauthorised visitor
 * (t_4fbc8f48).
 *
 * Reads the `error` query param (set by /auth/callback or by Better Auth's
 * `?error=INVALID_TOKEN`): any error → "request a new link" state
 * (role=alert), reachable by guests, rendered BEFORE the gates (ADR-PWR-3).
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSessionUser } from "@/lib/session";
import { buildMetadata } from "@/lib/seo";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Set a new password — Adroit Academy",
  description: "Set a new password for your Adroit Academy account.",
  path: "/reset-password",
  noindex: true,
});

/** Collapse string|string[] search params to the first non-empty value. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    token?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const errorParam = firstParam(params.error);
  const tokenParam = firstParam(params.token);

  // Expired / invalid link state (ADR-PWR-3) — shown to ANY visitor (guest or
  // authed), before any gate. Better Auth uses `INVALID_TOKEN`, the callback
  // uses expired/invalid; all mean the same thing to the reader.
  if (errorParam) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main" className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-[420px]">
            <div
              role="alert"
              className="rounded-[20px] border border-gray-200 bg-white p-8 shadow-card text-center dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]"
            >
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-2 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-red" />
                Adroit Academy
              </div>
              <div className="w-[52px] h-[52px] rounded-2xl bg-amber-light border border-amber/40 flex items-center justify-center mx-auto mb-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6 text-amber-700 dark:text-amber-300"
                >
                  <path d="M12 8v4m0 4h.01" />
                  <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                </svg>
              </div>
              <h1 className="text-[1.6rem] font-extrabold text-navy tracking-[-0.02em] mb-1.5 dark:text-[var(--ink-primary)]">
                This link has expired
              </h1>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6 dark:text-[var(--ink-muted)]">
                Reset links are valid for <b className="text-gray-800 dark:text-[var(--ink-body)]">30 minutes</b>{" "}
                and can only be used once. Request a fresh one and we&rsquo;ll get you sorted.
              </p>
              <Link
                href="/forgot-password"
                className="block h-11 rounded-xl bg-navy text-white text-sm font-bold text-center leading-[2.75rem] no-underline hover:bg-navy-light active:scale-[0.98] transition-all duration-150"
              >
                Request a new link
              </Link>
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

  // Token path: the emailed single-use token is the credential. Imported
  // legacy users are signed out, so this must work for guests.
  if (tokenParam) {
    return <ResetPasswordForm token={tokenParam} />;
  }

  // Session path: an authed user may set a new password from here too.
  // Everyone else is redirected to login; the form markup is never rendered
  // into the SSR HTML for them (closes t_4fbc8f48).
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/reset-password");
  }

  return <ResetPasswordForm />;
}
