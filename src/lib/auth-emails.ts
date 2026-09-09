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
