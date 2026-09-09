/**
 * Preview allowlist helper (draft-state t_e1c8239e).
 *
 * The /preview/* routes are gated by the existing Supabase SSR session plus
 * an email allowlist. The allowlist source is the `PREVIEW_ALLOWED_EMAILS`
 * env var (comma-separated, lowercase-trimmed) — matching the BA's auth-gate
 * design. A server constant fallback keeps the feature functional when the
 * env var is not set locally (e.g. preview/dev without Vercel env), so
 * editors can still be granted access.
 *
 * NOTE: this helper is server-only — it reads env at module load and is
 * imported by server components only. It never ships to the client.
 */
const FALLBACK_ALLOWED_EMAILS = process.env.PREVIEW_ALLOWED_EMAILS
  ? process.env.PREVIEW_ALLOWED_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : ["chris@adroit.io", "perry@adroit.io"];

/** Normalized allowlist — lowercase, trimmed. */
const ALLOWED_EMAILS: ReadonlySet<string> = new Set(FALLBACK_ALLOWED_EMAILS);

/**
 * True when the given email (e.g. `user.email`) may view draft previews.
 * Comparison is lowercase + trimmed on BOTH sides to avoid case mismatch
 * locking out an editor (arch §3.3 risk mitigation).
 */
export function isPreviewEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && ALLOWED_EMAILS.has(normalized);
}
