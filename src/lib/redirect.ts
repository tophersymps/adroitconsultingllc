/**
 * Safe internal-redirect helper (CWE-601 open-redirect mitigation).
 *
 * The `next` query param on the login page is echoed into `router.push`
 * after a successful sign-in. An attacker who controls `next` can point it
 * at an external origin (`/login?next=https://evil.com`) and the browser
 * client-side-redirects there after the user authenticates — a phishing /
 * credential-harvesting vector.
 *
 * `sanitizeRedirectPath` only lets through values that look like a single
 * leading-slash internal path. External schemes, protocol-relative URLs
 * (`//host`), backslash escapes (`/\host`), and multi-slash prefixes
 * (`///host`) all fall back to the default. This mirrors the check Val-El
 * specified in the security audit (t_d8a9dae6) and guards the common
 * bypasses.
 */
export const DEFAULT_REDIRECT = "/blog";

/**
 * Return `path` if it is a safe internal relative path, otherwise the
 * `fallback` (default `DEFAULT_REDIRECT`).
 *
 * Rules (in order):
 * - non-string / empty → fallback
 * - must start with exactly one `/` (rejects `https://…`, `javascript:…`,
 *   and empty)
 * - must not start with `//` (protocol-relative)
 * - must not start with `/\` (backslash escape, e.g. `/\host`)
 * - must not start with `///` (multi-slash collapse → browser treats as
 *   protocol-relative on many servers)
 */
export function sanitizeRedirectPath(
  path: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof path !== "string" || path.length === 0) return fallback;
  if (!path.startsWith("/")) return fallback;
  // Covers //…, /\…, and ///… in one check: the first character must be `/`
  // and the second must not be `/` or `\`.
  if (path.length > 1 && (path[1] === "/" || path[1] === "\\")) return fallback;
  return path;
}
