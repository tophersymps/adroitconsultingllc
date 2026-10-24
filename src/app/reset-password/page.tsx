/**
 * /reset-password — set a new password with a reset token (Managed Better Auth).
 *
 * SERVER component with ONE gate, evaluated before any form markup is emitted:
 *   `?token=…` — the single-use token from the reset email IS the credential.
 *   Legacy/imported users are signed OUT and still must be able to reset, so
 *   this works for guests.
 *
 * There is no session path. Before R2-1 (Supabase) the page rendered the form
 * for anyone with a recovery session; `/api/auth/reset-password/update` on
 * Managed Better Auth redeems a TOKEN and answers 401 to a body without one,
 * so a session-gated form could only ever fail on submit (a dead end, the same
 * class of bug as the emailed-link dead end in t_233b6f61). A visitor with no
 * usable token therefore gets an explicit "request a new link" state
 * (role=alert) and never the form — for guests and signed-in users alike.
 *
 * `error` (Better Auth's `?error=INVALID_TOKEN`, the /auth/callback shim's
 * expired/invalid) means the token is dead → "expired" copy (ADR-PWR-3).
 * No error and no token means the page was opened directly → "missing" copy.
 */
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { buildMetadata } from "@/lib/seo";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Set a new password — Adroit Academy",
  description: "Set a new password for your Adroit Academy account.",
  path: "/reset-password",
  noindex: true,
});

/**
 * Mirror of MAX_TOKEN in the update route. A token longer than this can never
 * be redeemed (the route answers 401 before touching the DB), so the page
 * treats it as dead rather than rendering a form that can only fail (F-S3).
 */
const MAX_TOKEN = 512;

/** Collapse string|string[] search params to the first non-empty value. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Explicit "no usable link" state. `expired` = a token was presented and is
 * dead; `missing` = no token at all. Both point at /forgot-password.
 */
function LinkProblemState({ kind }: { kind: "expired" | "missing" }) {
  const expired = kind === "expired";
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
              {expired ? "This link has expired" : "This page needs your reset link"}
            </h1>
            <p className="text-[13px] text-gray-500 leading-relaxed mb-6 dark:text-[var(--ink-muted)]">
              {expired ? (
                <>
                  Reset links are valid for{" "}
                  <b className="text-gray-800 dark:text-[var(--ink-body)]">30 minutes</b>{" "}
                  and can only be used once. Request a fresh one and we&rsquo;ll get you sorted.
                </>
              ) : (
                <>
                  The link we email you carries a{" "}
                  <b className="text-gray-800 dark:text-[var(--ink-body)]">single-use token</b>{" "}
                  that opens this page. Request a fresh one and we&rsquo;ll get you sorted.
                </>
              )}
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

  // A dead token (or an upstream error) wins over anything else in the URL.
  if (errorParam) {
    return <LinkProblemState kind="expired" />;
  }

  // The token is the only credential the update route redeems — without it the
  // form would be a guaranteed 401, so it is never rendered.
  if (!tokenParam) {
    return <LinkProblemState kind="missing" />;
  }

  // Over-long token: the route rejects anything above MAX_TOKEN, so render the
  // dead-link state instead of a form that is guaranteed to 401 (F-S3).
  if (tokenParam.length > MAX_TOKEN) {
    return <LinkProblemState kind="expired" />;
  }

  return <ResetPasswordForm token={tokenParam} />;
}
