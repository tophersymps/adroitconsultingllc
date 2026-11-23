### Local dev: signed-in pages render as guest over http on loopback (t_c03fea8a)

**What** - Two changes, both in the auth transport seam:

1. `isSecureRequest()` (`src/lib/auth/transport.ts`) now consults the loopback Host
   before the `x-forwarded-proto` signal. A Host that `isLoopbackHost()` accepts
   (`localhost`, `127.0.0.0/8`, `[::1]`, `*.localhost`) is a secure context, so the
   transport is secure even when `next dev` answers `x-forwarded-proto: http`. An
   `https` signal still wins as before, and a non-loopback Host over http is still
   insecure (the F2 LAN regression is re-pinned by a test).
2. New `upstreamAuthCookieHeader(cookieHeader, secure)` is applied to the two direct
   upstream calls in `src/lib/db/server.ts` (`/token` and `/get-session`). On a secure
   transport it returns the header byte-for-byte unchanged; on an insecure transport it
   re-labels the plain `neon-auth.*` names to the SDK's `__Secure-neon-auth.*` wire
   names, exactly as `authCookiesForUpstream()` already does for the proxy and SDK
   paths. It replaces the `NODE_ENV === "development"`-only `localDevSessionCookie()`
   helper, which covered `/token` but not the `/get-session` identity read.

**Why** - On a dev server at `http://localhost:3000`, `next dev` sends
`x-forwarded-proto: http` alongside `host: localhost:3000`. The old precedence let the
protocol signal win, so `isSecureRequest()` was false: the WRITE path (sign-in route
and cookie jar) stored the session under the plain `neon-auth.session_token` name while
the READ path resolved `__Secure-neon-auth.session_token`. The result was a signed-in
user whose client session was valid (`GET /api/auth/session` answered 200 with the
user, the header showed the account menu) but whose server-rendered pages were guests:
`GET /profile` rendered the `LockedSkyTeaser` guest variant and `GET /settings` answered
`307 -> /login?next=/settings`. Production was unaffected (https keeps the prefixed
names), which is exactly why it silently invalidated every local signed-in check of a
server component.

**Verified** - On a fresh dev server (`npx next dev -p 3000`) against the `dev-admin-ux`
Neon branch, with a throwaway QA user from `scripts/qa-create-test-user.cjs`:
`POST /api/auth/login` answered 200 and set `__Secure-neon-auth.session_token` +
`__Secure-neon-auth.local.session_data`, both `Secure; HttpOnly; Path=/`. With those
cookies: `GET /profile` 200 with the identity view (email rendered, no "Sign in or
create account", no locked-sky teaser, confirmed in Chrome via CDP and a screenshot) and
`GET /settings` 200 (no 307). Anonymous, unchanged: `GET /profile` 200 with the
locked-sky teaser and the guest CTA, `GET /settings` 307 -> `/login?next=/settings`.
`npx vitest run`: 199 files, 1961 tests passed. The QA user was deleted afterwards
(1 auth_user, 1 account, 4 sessions, 1 public_user row). Both new tests were proven to
bite by disabling each half of the fix and watching them fail.

**Known Issues** - A browser that already holds the pre-fix plain cookie is treated as a
guest on loopback until it signs in again (the secure transport no longer accepts the
plain name, deliberately: up-converting it would reopen the M2 session-fixation vector).
`getNeonSessionUser()` also still forwards the request's non-auth cookies upstream
unchanged; out of scope here.
