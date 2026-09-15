# Requirements: Password Reset + Signup Confirmation Recovery

Tenant: adroit-blog · Author: Lois (BA) · Date: 2026-08-31
Reference plan: ~/.hermes/plans/2026-08-31_password-reset.md
Status: READY FOR ARCHITECT (brainiac)

## 1. Request Summary

Adroit Academy (Next.js App Router + Supabase email/password auth, server-cookie
sessions) has NO user-facing password recovery: no forgot-password link, no
recovery callback, no reset page. Anyone who forgets or mistypes a password is
permanently locked out. A live incident (natalie.sympson@gmail.com) exposed the
same gap for signup confirmation: Supabase's `site_url` was
`http://localhost:3000`, so every confirmation/reset email linked to an
unreachable host, and unconfirmed accounts cannot sign in
(`mailer_autoconfirm: false`, `mailer_allow_unverified_email_sign_ins: false`).
Kelex fixed `site_url` + `uri_allow_list` in the Supabase dashboard (verified
live: `https://adroit.io`, `https://www.adroit.io`,
`https://adroit-blog.vercel.app`). This requirement covers the APP-SIDE build:
a complete forgot-password → email → callback → reset-password flow, plus
improved signup-confirmation error handling. Design must match the existing
/login editorial language (navy/red, mono kicker).

## 2. User Stories + Acceptance Criteria

### Epic A — Password reset flow

**US-1 (Forgot password request)**
As a signed-out user who forgot my password, I can request a reset link by
entering my email, so that I can regain access to my account.

Acceptance criteria:
- AC-1.1: `/forgot-password` renders a page matching the /login editorial
  design (mono kicker, navy button, red focus ring), with an email field
  (type=email, autoComplete=email) and a submit button.
- AC-1.2: Submitting a syntactically valid email POSTs to
  `POST /api/auth/reset-password/request` and the page shows a GENERIC
  confirmation state ("If an account exists for that email, we've sent a
  reset link") — identical message whether or not the email is registered
  (no user enumeration).
- AC-1.3: Submitting an invalid/empty email shows an inline validation error
  and does NOT call the API.
- AC-1.4: The request route calls `resetPasswordForEmail(email, { redirectTo })`
  where `redirectTo` ALWAYS points at the live origin
  (`/auth/callback?next=/reset-password`), never localhost — set explicitly in
  code, independent of the dashboard `site_url`.
- AC-1.5: The request route is rate-limited using the existing
  `checkRateLimit`/`getClientIp` pattern (per-IP, consistent with
  api-security.ts). A rate-limited request returns a generic message, not a
  distinct error revealing the limit.
- AC-1.6: The request route applies `checkOrigin` for cross-origin POST
  protection, consistent with other POST routes.
- AC-1.7: Supabase-side failures (e.g. email service down) return the same
  generic success message to the client; the real error is logged
  server-side only.
- AC-1.8: Page is noindexed (auth surface), keyboard-navigable, focus
  management on submit, status announced via aria-live (WCAG AA).

**US-2 (Recovery callback)**
As a user who clicked the link in my reset email, the app exchanges the
single-use code for a session and takes me to the reset page, so that I can
set a new password.

Acceptance criteria:
- AC-2.1: `GET /auth/callback` reads `code` (and optional `next`) from the
  query string.
- AC-2.2: A valid code is exchanged via `exchangeCodeForSession(code)` on the
  SSR client, which writes the HttpOnly session cookie server-side, then
  redirects to the sanitized `next` (default `/reset-password`).
- AC-2.3: `next` is sanitized with `sanitizeRedirectPath` (CWE-601) — external
  schemes, protocol-relative, and backslash values fall back to
  `/reset-password`.
- AC-2.4: An expired, already-used, or invalid code does NOT crash: the user
  is redirected to a clear "link expired or already used — request a new one"
  state (e.g. `/reset-password?error=expired` or `/forgot-password?resent=1`
  with an inline notice), never a 500.
- AC-2.5: A missing `code` parameter produces the same graceful error state.
- AC-2.6: The callback is a GET route handler (Supabase links are plain
  navigations) and must interoperate with `src/proxy.ts` (which runs
  `getUser()` on all non-api routes before the handler): the session cookie
  written by the callback must be the one the browser ends up with.
- AC-2.7: Unit tests cover valid code, invalid code, expired code, missing
  code, and malicious `next` values.

**US-3 (Reset password page)**
As a user arriving from a valid reset link, I can choose a new password, so
that I can sign in with it.

Acceptance criteria:
- AC-3.1: `/reset-password` is auth-gated: if the SSR session has no user,
  the page redirects to `/login?next=/reset-password` (no form rendered).
- AC-3.2: An authenticated user sees a new-password field (min 6 chars,
  matching the existing validation) plus a confirm-password field; mismatch
  shows an inline error and does not submit.
- AC-3.3: Submitting POSTs to `POST /api/auth/reset-password/update` with
  `{ password }`; the route requires an active session (401 if guest) and
  calls `supabase.auth.updateUser({ password })`.
- AC-3.4: On success the page shows a success state ("Password updated —
  sign in with your new password") and triggers `notifyAuthChanged()` so
  client auth state re-reads.
- AC-3.5: The user can then sign in successfully with the NEW password (the
  old password no longer works).
- AC-3.6: Server-side validation errors (too short, etc.) surface as inline
  field errors; Supabase errors are logged server-side and shown as a
  generic client message.
- AC-3.7: If the page is reached with an `error` query param from the callback
  (expired/used code), it shows the "request a new link" state with a link to
  `/forgot-password` instead of the form.
- AC-3.8: Page is noindexed, keyboard-navigable, aria-live status, WCAG AA.

**US-4 (Login-page forgot link)**
As a user on the sign-in form, I can find a "Forgot password?" link, so that
I know recovery exists.

Acceptance criteria:
- AC-4.1: In SIGNIN mode only, a "Forgot password?" link appears under the
  password field, navigating to `/forgot-password`.
- AC-4.2: The link is styled consistently with existing editorial form links
  (navy text, red underline accent) and is keyboard-focusable with a visible
  focus state.
- AC-4.3: The link is NOT shown in signup mode.
- AC-4.4: If the login page carries a `next` param, the forgot link preserves
  it (e.g. `/forgot-password?next=…`) so the reset flow can return to the
  original destination after re-auth — or the flow explicitly documents that
  `next` is dropped and the user lands on `/blog`. (Decision needed from
  architect; see Open Questions.)

### Epic B — Signup confirmation recovery

**US-5 (Helpful unconfirmed-email error)**
As a user who just signed up but hasn't confirmed my email, when I try to
sign in I get a helpful message pointing me to my inbox, so that I understand
why sign-in fails.

Acceptance criteria:
- AC-5.1: When Supabase returns the email-not-confirmed error on signin
  (401, message containing "confirm"), the login API returns a distinct,
  user-friendly message (e.g. "Please check your inbox for a confirmation
  email before signing in.") instead of the raw Supabase string.
- AC-5.2: The message does NOT reveal whether the email is registered beyond
  what Supabase itself discloses, and does not leak internal details.
- AC-5.3: The login page renders this as an error (role=alert) consistent
  with existing error styling.

**US-6 (Resend confirmation)**
As a user whose confirmation email was lost or whose link was broken, I can
resend the confirmation email, so that I can complete signup.

Acceptance criteria:
- AC-6.1: A "Resend confirmation email" action is available in the
  unconfirmed-email error state (and optionally on the forgot-password page
  for the same email — architect's call), calling
  `supabase.auth.resend({ type: "signup", email })` via the SSR client with an
  explicit `redirectTo` to the live origin.
- AC-6.2: Response is generic (no enumeration) and rate-limited per
  AC-1.5/AC-1.6 patterns.
- AC-6.3: All auth-email calls (signup, resend, reset) pass an explicit
  `redirectTo` on the live origin so links never depend on dashboard
  `site_url` — this is the code-level guard against a repeat of the
  natalie incident.

## 3. Feature Inventory (keep / merge / drop)

Existing auth surface — disposition:

| # | Item | Path | Disposition | Notes |
|---|------|------|-------------|-------|
| 1 | Login/signup page (signin+signup modes, `next` handling, editorial design) | src/app/login/page.tsx | KEEP + EXTEND | Add US-4 forgot link (signin mode); add US-5 friendly unconfirmed error handling; add US-6 resend action in error state |
| 2 | Login API (signin/signup, EMAIL_RE, min-6 password) | src/app/api/auth/login/route.ts | KEEP + EXTEND | Map Supabase "confirm" error to friendly message (US-5); consider origin/rate-limit parity with other POST routes |
| 3 | Login layout (noindex metadata via buildMetadata) | src/app/login/layout.tsx | KEEP | New auth pages (/forgot-password, /reset-password) need equivalent noindex metadata (new layouts or per-page metadata) |
| 4 | Session API | src/app/api/auth/session/route.ts | KEEP | /reset-password auth gate reads session via SSR client (or this endpoint client-side) |
| 5 | Logout API | src/app/api/auth/logout/route.ts | KEEP | Unchanged |
| 6 | Supabase SSR client (fails closed) | src/lib/supabase/server.ts | KEEP | Used by all new routes |
| 7 | Supabase browser client | src/lib/supabase/client.ts | KEEP | Unchanged; browser never talks to Supabase directly for session state |
| 8 | sanitizeRedirectPath (CWE-601) | src/lib/redirect.ts | KEEP + REUSE | Must be applied to `next` in /auth/callback (AC-2.3) |
| 9 | api-security helpers (checkRateLimit, getClientIp, checkOrigin, sanitiseDbError) | src/lib/api-security.ts | KEEP + REUSE | New reset request/update routes adopt the same pattern (AC-1.5/1.6) |
| 10 | useAuth hook + notifyAuthChanged | src/lib/hooks/useAuth.ts | KEEP + REUSE | Reset page calls notifyAuthChanged after success (AC-3.4) |
| 11 | Next 16 proxy (session refresh) | src/proxy.ts | KEEP | Matcher runs on /auth/callback (non-api); callback's cookie write must win (AC-2.6) |
| 12 | GoTrue admin user readers (service role) | src/lib/supabase/auth-admin.ts | KEEP — OUT OF SCOPE | Admin-only; not part of this flow. One-off natalie account fix is a separate admin action, NOT in this pipeline |
| 13 | Preview email allowlist | src/lib/preview-auth.ts | KEEP — OUT OF SCOPE | Unrelated gate |
| 14 | Admin users UI + admin user APIs | src/app/admin/users/*, src/app/api/admin/users/* | KEEP — OUT OF SCOPE | Unrelated |

DROP: none. No existing auth bit is removed.

NEW (to build):
- `POST /api/auth/reset-password/request` (US-1)
- `GET /auth/callback` route handler (US-2)
- `POST /api/auth/reset-password/update` (US-3)
- `/forgot-password` page (US-1)
- `/reset-password` page (US-3)
- Login-page forgot link + unconfirmed error + resend (US-4/5/6)
- Noindex metadata for new auth pages
- Tests for request route (enumeration-safe, validation, rate limit) and
  callback (valid/invalid/expired/missing code, malicious next)

## 4. Edge Cases (signup confirmation + reset)

1. **Unconfirmed email, can't log in** — Supabase 401 with "confirm" in
   message → friendly message + resend action (US-5/US-6). Must not crash or
   show raw Supabase string.
2. **Broken confirmation/reset link (localhost)** — dashboard fix is live,
   BUT code must pass explicit `redirectTo` on every auth-email call so links
   always point at the live origin regardless of dashboard config (AC-6.3).
   Regression guard: no hardcoded localhost in any auth call.
3. **User enumeration** — forgot-password request, resend, and any
   account-existence check return identical generic responses for known and
   unknown emails (AC-1.2, AC-6.2). Rate-limit rejections must also be
   generic (AC-1.5).
4. **Token/link expiry** — recovery token expired or already used → graceful
   "request a new link" state, never a 500 (AC-2.4, AC-3.7).
5. **Open redirect** — `next` in /auth/callback (and anywhere reset flow
   echoes a path) sanitized via sanitizeRedirectPath; test malicious values:
   `https://evil.com`, `//evil.com`, `/\evil.com`, `///x`, `javascript:alert(1)`
   (AC-2.3, AC-2.7).
6. **Missing/malformed code** — /auth/callback with no `code`, empty `code`,
   or garbage → graceful error state (AC-2.5).
7. **Guest hits /reset-password directly** — auth gate redirects to
   /login?next=/reset-password (AC-3.1).
8. **Password policy** — new password < 6 chars or confirm mismatch → inline
   client error, no API call; server re-validates (AC-3.2/3.6).
9. **Rate limiting / abuse** — per-IP sliding window on request + resend
   routes; in-memory per-process limiter is an accepted limitation (Vercel
   multi-instance) — document, don't over-engineer (AC-1.5).
10. **Email service failure** — Supabase mailer down → generic success to
    client, server-side log (AC-1.7). Do not tell the user "email failed"
    (would enable enumeration + leak infra).
11. **Session cookie interaction with proxy.ts** — proxy runs getUser()
    before the callback handler on /auth/callback; the exchange's cookie
    write must be the final response state (AC-2.6).
12. **Already-confirmed user requests reset** — works normally; new link
    issued, old tokens invalidated by Supabase (document, no special code).
13. **Multiple reset requests** — each request issues a new token; Supabase
    invalidates prior recovery tokens for that email (verify behavior in
    build; if not, note for architect).
14. **Dark mode** — new pages must honor the existing dark: token classes
    used in /login (visual parity).
15. **A11y/SEO** — keyboard navigation, focus management, aria-live status
    regions, noindex on all new auth pages, sitemap excludes them.

## 5. Data Entities / Integrations

- **No new data entities.** All state lives in Supabase auth (users,
  recovery tokens, sessions). No schema changes, no new tables, no new env
  vars.
- **Integrations:** Supabase GoTrue (resetPasswordForEmail,
  exchangeCodeForSession, updateUser, resend signup) via the existing SSR
  client. Dashboard config (site_url, uri_allow_list) already fixed live —
  code must not depend on it (explicit redirectTo).
- **Out of scope (explicit):** resetting natalie.sympson@gmail.com's account
  (one-off admin action via GoTrue admin API / dashboard, separate task);
  regenerating Supabase email templates (reset template already uses
  `{{ .ConfirmationURL }}` which now resolves to adroit.io).

## 6. Scope

**In SOW.** This is core product auth functionality for the Adroit Academy
blog; the plan is approved and the dashboard precondition is fixed live.

## 7. Priority

**High.** Users are currently hard-locked out with no recovery path; a live
incident already demonstrated the failure mode.

## 8. Constraints

- Match /login editorial design language (navy/red, mono kicker, dark-mode
  tokens) — no new design system.
- Reuse existing security helpers (sanitizeRedirectPath, checkRateLimit,
  getClientIp, checkOrigin) — no new security abstractions.
- Server-side Supabase pattern only (getSupabaseServerClient); browser never
  calls Supabase directly for session state.
- No new env vars, no schema changes, no new deps expected.
- `npm run build` + `npm run lint` must pass with 0 errors/warnings.
- Next 16 conventions per node_modules/next/dist/docs (proxy file convention,
  etc.) — build team reads those guides before coding.
- Do NOT touch auth users or natalie's account as part of this build.

## 9. Dependencies

- Supabase dashboard `site_url`/`uri_allow_list` fix — DONE (verified live).
- Existing SSR client, redirect helper, api-security helpers — DONE.
- Downstream chain: Arch (brainiac) → Design (kara) → Build (steel) →
  A11y (lara) + QA (zod) + Security (val-el) → Deploy (alpha).

## 10. Open Questions (for architect — not blocking)

1. **`next` propagation through reset flow:** should /forgot-password carry
   and forward `next` from login (AC-4.4), or keep it simple and always land
   on /blog after reset? Recommend simple (drop `next`) unless architect
   sees a reason — fewer moving parts, one less CWE-601 surface.
2. **Resend confirmation placement:** inside the login error state only, or
   also on /forgot-password? Recommend login error state only (less surface).
3. **Callback error landing page:** `/reset-password?error=expired` vs
   `/forgot-password?resent=1` — recommend the former (keeps the user on the
   reset page, one less route).
4. **Proxy.ts interplay (AC-2.6):** confirm with build team that the
   exchangeCodeForSession cookie write from the route handler survives the
   proxy's earlier cookie handling on the same response.
