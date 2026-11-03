### Local dev sign-in no longer degrades every user to a guest (local-dev-session-cookie)

**What** - `src/lib/db/server.ts` adds `localDevSessionCookie()`. Under `NODE_ENV=development` only, the caller's own `neon-auth.session_token` cookie is re-labelled `__Secure-neon-auth.session_token` for the server-side `GET /token` mint.

**Why** - over plain `http://localhost` the auth SDK sets the cookie without the `__Secure-` prefix, but Managed Better Auth only accepts the prefixed name. `/token` answered 401, so `isAdmin` resolved false and `/admin` returned 403 for admins in local dev (reproduced: same credentials, prefixed name 200, plain name 401). Production uses HTTPS and the prefixed name already, so it is unchanged.

**Verified** - on the `dev-admin-ux` branch, the QA admin's `/api/auth/session` went from `isAdmin:false` to `true`, and `GET /api/admin/users` and `/admin` went from 403 to 200. New unit test `src/lib/db/server.local-cookie.test.ts`.

**Known Issues** - None.
