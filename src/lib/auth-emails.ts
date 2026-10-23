/**
 * src/lib/auth-emails.ts — single code-level guard for auth-email redirect URLs.
 *
 * ADR-PWR-1: every auth-email `redirectTo` MUST point at the live origin
 * (`<siteConfig.url>/auth/callback?next=…`), never localhost. This is the
 * app-side guard against a repeat of the natalie incident, where Supabase's
 * `site_url` was `http://localhost:3000` and every confirmation/reset email
 * linked to an unreachable host.
 *
 * The origin is hard-coded to `siteConfig.url` (https://adroit.io) and never
 * derived from the request host — deriving from the request would let a
 * localhost dev server or a mismatched deploy origin produce a redirectTo
 * that Supabase's `uri_allow_list` rejects (silent email failure).
 */
import { siteConfig } from "@/lib/seo";

/** Canonical origin for all auth-email redirects (ADR-PWR-1). */
export const AUTH_ORIGIN = siteConfig.url;

/** Callback path that exchanges the recovery code for a session. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Build a `redirectTo` for an auth-email call.
 *
 * @param next internal path the callback should land on after exchanging the
 *   code (default `/reset-password`). Passed through the callback's own
 *   `sanitizeRedirectPath` on the way back, so it is safe to include here.
 */
export function buildAuthRedirect(next: string = "/reset-password"): string {
  return `${AUTH_ORIGIN}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Origin that Managed Better Auth will accept for `callbackURL` / `redirectTo`.
 *
 * Better Auth validates the redirect against the ORIGIN OF THE REQUEST, not
 * just the project's trusted-domain list (verified 2026-10-23: sending
 * `callbackURL: https://adroit.io/…` from an `Origin: http://localhost:3000`
 * request returns `403 INVALID_CALLBACK_URL`, and vice-versa). The browser
 * always sets `Origin` on our same-origin POSTs, and `checkOrigin()` has
 * already rejected anything else, so echoing it back is safe — and it makes
 * preview deployments work, which a hard-coded production origin cannot.
 *
 * Falls back to the canonical site origin for non-browser callers (server-side
 * scripts), which is correct in production and fails closed elsewhere.
 */
export function authRedirectOrigin(reqOrigin: string | null | undefined): string {
  if (reqOrigin && /^https?:\/\/[^/]+$/.test(reqOrigin)) {
    return reqOrigin;
  }
  return AUTH_ORIGIN;
}

/**
 * Build the `redirectTo` for Better Auth password-reset emails.
 *
 * Managed Better Auth appends the token itself (`<redirectTo>?token=…`, or
 * `?error=INVALID_TOKEN` for a dead link), so this must NOT already carry a
 * query string — otherwise the token lands inside an encoded parameter.
 */
export function buildPasswordResetRedirect(
  reqOrigin?: string | null,
): string {
  return `${authRedirectOrigin(reqOrigin)}/reset-password`;
}

/** Same rule for signup/resend verification links (token appended upstream). */
export function buildVerifyEmailRedirect(
  reqOrigin?: string | null,
): string {
  return `${authRedirectOrigin(reqOrigin)}/field-notes`;
}
