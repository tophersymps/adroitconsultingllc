# Contract: `GET /api/db/token` must fail closed on auth-mint failure

- **Status:** NORMATIVE — implementation (t_142d2334) and its tests must satisfy §11; audit is t_6ddf15c3
- **Date:** 2026-10-26
- **Author:** val-el (security auditor)
- **Card:** t_967f0f8e — child of t_a0012d31 (root), sibling of investigation t_dd3df89b
- **Code base audited:** `adroit-code` @ `main` `31e48fc8` (no local diff)
- **CWE coverage:** CWE-636 (fail-open), CWE-287, CWE-863 (wrong role / broken access control),
  CWE-209 (internal detail exposure), CWE-525 (cacheable identity response), CWE-778 (insufficient logging)

---

## 0. The invariant

> **A request that presents a session credential MUST NEVER be answered with guest credentials,
> a `200 {token:null}` success, or data read under the Postgres `anonymous` role.**

Formally, for every response `R` to `GET /api/db/token`:

| Request carried a session cookie | Allowed outcomes |
|---|---|
| yes | `200 {token: "<jwt>"}` **or** `401` **or** `503`. Nothing else. In particular `200 {token:null}` is forbidden. |
| no | `200 {token:null}` **or** `503`. A token must never be minted for a credential-less request. |

"The user could not be authenticated right now" and "the user is a guest" are different facts and must
produce different responses. Collapsing them is the defect this contract closes.

---

## 1. Current behavior (evidence — what must change)

Four places collapse failure into "guest". All four are in scope:

1. **`src/app/api/db/token/route.ts:24-31`** — the `catch` returns `200 {token:null}` and the doc comment
   says *"Auth backend unreachable → degrade to guest"*. A mint failure for a signed-in user is therefore
   reported to the client as a successful guest answer.
   Also: `getSessionJwt()` returns `string | null`, so the route **cannot** distinguish the two cases —
   the classification already computed in `fetchTokenResult` (`ok:false` + `errorClass` + `status`) is
   discarded by `mintSessionJwt` (`src/lib/db/server.ts:289-296`).
2. **`src/lib/db/server.ts:394-405`** — `getSupabaseServerClient()` does
   `(await mintSessionJwt(deadline)) ?? (await getAnonymousJwt(deadline))`. With **no** notion of
   "did the request present a credential", a signed-in render whose session mint fails is served the
   **`anonymous`-role JWT**. 48 non-test call sites consume this seam, including all `/api/progress/*`
   and `/api/admin/*` routes and `src/app/{settings,profile}/page.tsx`. This is the guest-scoped read
   path in the card's title; it is server-side, not browser-side.
3. **`src/lib/db/token-cache.ts:57-64`** — `getToken()` maps every non-`ok` response (including a future
   `401`/`503`) to `null`, and caches that `null` for `TOKEN_TTL_MS` (60 s). A transient outage is thus
   reported to the SDK as "no identity" and is memoised for a minute.
4. **`src/lib/db/server.ts:316-346`** — `getNeonSessionUser()` returns `null` on any auth error, so
   "signed in" cannot be inferred from it. **Do not** use it as the credential-present predicate
   (§9 covers why); it is a fail-null identity read, by design.

### Verified facts (probed against the installed tree, not assumed)

- `@neondatabase/postgrest-js`'s `fetchWithToken` **throws `AuthRequiredError` when `getToken()`
  resolves falsy, before any Data API request is issued** (probe on `node_modules/.../dist/index.mjs:137-149`).
  So the *browser* path is fail-closed today: a `null` token never becomes a header-less request.
- Consequence: the A8 symptom (guest-looking completion state) is produced by the client **swallowing**
  the rejection (`src/lib/hooks/useLessonProgress.ts:56,69,83,122` all `catch {}` → renders
  "not completed"), **not** by a browser request running as `anonymous`. The `anonymous`-role reads come
  from item 2 (SSR). The card's user-visible symptom is real; the mechanism in zod's note is only half right.
  Do not "fix" the browser into sending an anonymous token — that would create the vulnerability it assumes.

---

## 2. Definitions (normative)

- **Session credential present** — the request carries the session cookie for the *current transport*:
  `__Secure-neon-auth.session_token` on https (and loopback), `neon-auth.session_token` on plain http.
  Reuse the existing predicate — `isSecureRequest()` (`@/lib/auth/transport`) +
  `SESSION_COOKIE_NAME`/`PLAIN_SESSION_COOKIE_NAME` in `src/lib/session.ts:41,54`. The predicate already
  exists inline at `src/lib/session.ts:77-81` inside `getSessionUser()`; **extract it** into an exported
  `hasSessionCredential(): Promise<boolean>` that touches `next/headers` only and performs **no** network
  call. Do not duplicate the name-selection logic in the route. A cookie under the *other* name MUST NOT
  count (accepting both is the CWE-384 session-fixation vector fixed in M2/t_7ecb98d7).
  Presence ≠ validity: an expired or revoked session cookie is still "present".
- **Guest** — no session cookie under the transport-correct name. This is a decision made from
  `next/headers` alone and requires **no** upstream call (§10 G1).
- **Mint failure classes** — as already classified by `fetchTokenResult`:
  `http:401|403` (identity-specific), `http:429|5xx` (endpoint unhealthy), `network` (error/abort/cooldown),
  `malformed` (200 with no usable/`role`-wrong token), `config` (`authBaseUrl()` throw — missing `NEON_AUTH_BASE_URL`).

---

## 3. Response contract

All branches set the headers in §6. `token_path` in logs is always the literal `/token`.

| # | Case | Status | Body | Extra headers |
|---|---|---|---|---|
| R1 | Credential present, mint `ok` | `200` | `{ "token": "<jwt>" }` | — |
| R2 | No credential (guest) | `200` | `{ "token": null }` | — |
| R3 | Credential present, upstream `/token` → `401` **or** `403` | `401` | `{ "error": "Your session has expired. Please sign in again.", "code": "SESSION_INVALID" }` | — (no `WWW-Authenticate`) |
| R4 | Credential present, any other mint failure (network, timeout, cooldown, `429`, `5xx`, `malformed`) | `503` | `{ "error": "We can't verify your session right now. Please try again in a moment.", "code": "AUTH_MINT_UNAVAILABLE" }` | `Retry-After` when known |
| R5 | Credential present, `config` failure (missing `NEON_AUTH_BASE_URL`) | `503` | same as R4 | — |
| R6 | Any branch above where upstream advertised `x-retry-after` (seconds) or a mint cooldown is active | unchanged | unchanged | `Retry-After: <n>`, clamped `1..120`, integer seconds |

Rules that follow from the table:

- **`200 {token:null}` is reachable only from R2.** A `200` on a credential-bearing request MUST carry a
  non-empty string token.
- **`403` is never returned.** The mint is not an authorization decision; 403 would imply "authenticated but
  not allowed", which is false here. Upstream 401 and 403 are both normalized to R3.
- **`500` is never returned for a mint failure.** A misconfigured runtime is "this capability is
  unavailable" to the caller, i.e. R5, not "your request was bad" or an unhandled crash. Uniform 503 also
  removes a config-vs-outage oracle.
- **No redirects.** `3xx` to `/login` MUST NOT be used: `fetch` would follow it and the JSON parser would
  receive HTML.
- **Branches are decided from the classification, not from the error message.** Never branch on
  `err.message` strings.
- R2 must short-circuit **before** any upstream fetch (§10 G1) — a guest must not spend the shared
  `/token` rate-limit bucket (§13).

### Payload schema

```ts
type TokenSuccess = { token: string };
type GuestSuccess = { token: null };
type TokenError = {
  error: string;                                  // fixed user-facing copy from the table
  code: "SESSION_INVALID" | "AUTH_MINT_UNAVAILABLE";
  retryAfterSeconds?: number;                     // mirror of the Retry-After header, when present
};
```

`code` is the machine-readable contract; `error` is display copy and may be reworded without a contract
change as long as it stays non-technical. Clients MUST branch on `code` (or status), never on `error`.

---

## 4. Leak rules (CWE-209)

A response body of this endpoint MUST NOT contain, directly or transitively:

- the upstream `message`/`body`/`details` from Managed Better Auth (Rate-limit copy, stack, SQL, hints);
- `NEON_AUTH_BASE_URL`, `NEON_DATA_API_URL`, any hostname, region, endpoint id, or `neonauth.`/`apirest.` string;
- the upstream status code, the error class, or any internal identifier (`errorClass`, `TOKEN_UNAVAILABLE`,
  class names, `correlation` tags) — these belong in logs only;
- the caller's token, cookie value, `Set-Cookie` material, user id or email;
- framework detail: no stack traces, no `Error.prototype` serialization, no `cause` chain.

The three fixed strings in §3 are the entire client-visible surface. In particular R4 must not become
"Neon Auth rate limit exceeded (429)" — that is an attacker-useful operational detail.

---

## 5. Status-code rationale (why not 401 everywhere, why not 403)

- **401 (R3) = "your credential is no longer acceptable; do not retry until the user re-authenticates."**
  Correct for upstream 401/403 only. Retrying is pointless and the client must clear cached identity.
- **503 (R4/R5) = "we cannot decide your identity right now; retry later."** Correct for anything where the
  answer might differ in a few seconds. The user is *not* told they are signed out, so a transient outage
  cannot push a signed-in user through a login loop or into guest UI.
- **200 + null (R2) = "you did not present a credential."** Only for requests that did not.
- 403, 500, 302 are explicitly rejected for the reasons in §3.

---

## 6. Caching (normative, every branch)

```http
Cache-Control: private, no-store, no-cache, must-revalidate
Vary: Cookie
```

- `private` is **added** to the current `no-store, no-cache, must-revalidate` (`route.ts:20-22`): the
  response is derived from the caller's cookie and must never be stored by a shared/intermediary cache.
- `Vary: Cookie` is **new** and mandatory: even with `no-store`, a misconfigured CDN that ignores
  `Cache-Control` must not be able to serve one user's JWT to another request. It also documents the
  cache key (`Cache-Control` alone is not an authorization boundary).
- Applies to `200`, `401` and `503` alike. Errors are not cacheable.
- Keep `export const dynamic = "force-dynamic"`. No `revalidate`, no ISR, no `ETag`, no `Last-Modified`.
- The upstream `fetch` stays `cache: "no-store"` (already true at `server.ts:233`).

## 7. Logging (CWE-778 / CWE-532)

Exactly **one** `console.error` per failed request; **no** log on R1 or R2 (guest is not an error and
success must never log token material).

```ts
console.error("[api/db/token] auth mint failed", {
  event: "auth_mint_failed",       // or "auth_session_invalid" for R3
  tokenPath: "/token",
  errorClass: "http" | "network" | "malformed" | "config",
  status: 429,                     // upstream status, when there is one
  retryAfterSeconds: 30,           // when advertised
  cooldownRemainingMs: 4200,       // when the failure was a cooldown short-circuit
});
```

Mandatory:
- Must log R3, R4 and R5 — including R5 (`errorClass: "config"`), since a misconfigured deployment is
  otherwise silent. The body stays opaque; the log carries the diagnosis.
- Fields are flat and enumerated. **Never** pass a raw `Error`, `err`, `cause`, `headers` object, the
  request, the response, or the cookie store to the logger — `fetch` errors can stringify the full URL
  and `Headers` can stringify `Cookie`.
- Forbidden in logs: token (or any substring/prefix of it), cookie value, `Cookie`/`Authorization`/
  `Set-Cookie` header, user id, email, IP, response body, upstream hostname/URL. `tokenPath` is the path
  (`/token`) only.
- If a message is logged at all, it is `err.message` for a `config` failure — that message is
  `"NEON_AUTH_BASE_URL is required"` and contains no secret. Never log `err.stack` for `http`/`network`.
- No log-level escalation that would drop the line in production (use `console.error`, matching
  `src/app/api/atlas/cards/route.ts:78` and `.../admin/access/effective/route.ts:171`).

---

## 8. Client-facing error semantics (`src/lib/db/token-cache.ts`)

`getToken()` is the browser's only path to this endpoint. Contract per status:

| Response | `getToken()` must | Cache state |
|---|---|---|
| `200 {token}` | resolve the token | cache it for `TOKEN_TTL_MS` (unchanged) |
| `200 {token:null}` | resolve `null` — genuine guest | cache; identity changes already invalidate (§token-cache.ts:15-28) |
| `401 SESSION_INVALID` | `invalidateDbToken()`, resolve `null`, and signal "session expired" to the auth layer (so the UI can prompt re-auth) | dropped, must re-fetch next read |
| `503 AUTH_MINT_UNAVAILABLE` | `invalidateDbToken()` then **reject** with a classified retryable error (client analogue of `DbTokenUnavailableError`, `code: "TOKEN_UNAVAILABLE"`) | **never cached** |

Rules:
- **A `503` must never be turned into `null`.** `null` is interpreted by `@neondatabase/postgrest-js`
  `fetchWithToken` as `throw new AuthRequiredError()` (verified, §1) — the user would be told to sign in
  when the truth is "try again in a moment". Rejecting is also the only way the caller can distinguish
  a transient outage from a signed-out user.
- **Neither a `401` nor a `503` may be memoised** for the 60 s TTL. Only `200` bodies populate the cache.
- The blanket `.catch(() => null)` at `token-cache.ts:64` must go too: a fetch rejection (offline, aborted,
  TLS) is an *availability* failure, not a guest identity, and must reject classified
  (`code: "TOKEN_UNAVAILABLE"`) like R4 — otherwise an offline user is shown "sign in" and the `null` is
  memoised for 60 s.
- Honour `Retry-After` (header and/or `retryAfterSeconds`) as a *floor* before the next attempt; the client
  MUST NOT retry in a tight loop and MUST NOT auto-retry a `401`.
- Keep the "no token in the browser" invariant: whatever the branch, `getToken()` must never resolve to a
  *guest/anonymous* token. There is no client-side anonymous fallback and none may be added.
- User-visible copy for `503`: "We can't verify your session right now. Please try again in a moment."
  (retryable, no provider names, no status codes). For `401`: "Your session has expired. Please sign in again."
- Hooks that currently swallow errors into a default state (`useLessonProgress.ts:56,69,83,122`) SHOULD
  surface the classified `TOKEN_UNAVAILABLE` state rather than silently rendering the guest/empty view;
  at minimum they must not render an authenticated-success state. (Recommended, not gated by §11.)

## 9. Required companion change in the server data seam

The route contract alone cannot close the card: SSR reads bypass it. Normative for `src/lib/db/server.ts`:

1. Add a classified session-mint API (e.g. `getSessionTokenResult(): Promise<AnonTokenResult-style union>`)
   that preserves `fetchTokenResult`'s `errorClass`/`status`/`retryAfterSeconds`. `getSessionJwt()` may stay
   as a thin `ok ? token : null` wrapper for compatibility, but the route must use the classified form.
2. `getSupabaseServerClient()` becomes:

   ```ts
   const hasCredential = await hasSessionCredential();          // §2 predicate
   if (hasCredential) {
     const r = await mintSessionResult(deadline);
     return r.ok ? createDbClient(r.token) : createDegradedDbClient();   // NEVER anonymous
   }
   const anon = await getAnonymousJwt(deadline);
   return anon ? createDbClient(anon) : createDegradedDbClient();
   ```

   The `?? getAnonymousJwt(...)` fallback MUST NOT be reachable when a credential is present.
   This keeps the R2-5 "always resolves, never throws" invariant (48 call sites unchanged) and keeps the
   guest contract (`/api/progress/*` degraded 200) intact, while removing the wrong-role read.
3. `getSupabaseAnonymousClient()` and `anonymous-token.ts` are unchanged — an explicitly anonymous surface
   asking for an anonymous token is correct.
4. Do **not** implement the predicate via `getNeonSessionUser()`: it returns `null` both for guests and for
   an unreachable `/get-session` (and `/get-session` is itself subject to the 429 the reporter saw), so it
   would reintroduce the exact ambiguity. Use the cookie predicate (§2). Optionally corroborate with
   `getNeonSessionUser()` only when the cookie probe is negative — never to override a positive.
5. A missing env on this path must keep failing closed (throw → route R5), not degrade.

---

## 10. Test expectations (mandatory)

New file `src/app/api/db/token/route.test.ts` (none exists today). Reuse
`src/lib/db/test-support/throttled-auth.ts` (`applyThrottledAuthEnv`, `sessionCookieStore`,
`guestCookieStore`, `installThrottledAuth`, `dataApiRequests`) — do not fork a new fixture. All cases stub
`fetch` only; the real route + real `db/server.ts` run.

| # | Case | Assertions |
|---|---|---|
| G1 | Guest, no session cookie | `200`, body `{token:null}`, exactly `0` upstream `/token` requests, no error log, `no-store` + `Vary: Cookie` |
| G2 | Signed in, `/token` 200 token | `200`, `{token:"<jwt>"}`, headers per §6, no error log |
| G3 | Signed in, `/token` 401 | `401`, `code:"SESSION_INVALID"`, body has no upstream text/host, `no-store`, one log line |
| G4 | Signed in, `/token` 403 | `401`, `code:"SESSION_INVALID"` (normalized) |
| G5 | Signed in, `/token` 429 + `x-retry-after: 30` | `503`, `code:"AUTH_MINT_UNAVAILABLE"`, `Retry-After: 30`, `retryAfterSeconds: 30` |
| G6 | Signed in, 5xx / network error / abort | `503`, same code, no `Retry-After` unless known |
| G7 | Signed in, `/token` 200 `{}` / `{token:""}` / non-JWT string | `503` (`errorClass:"malformed"` logged), never `200 {token:null}` |
| G8 | Misconfigured `NEON_AUTH_BASE_URL` | `503`, opaque body, log `errorClass:"config"`, no hostname in body |
| G9 | Cooldown active (fail, then re-request inside `MINT_COOLDOWN_MS`) | second call `503` with `Retry-After ≥ 1` and **no** second upstream attempt |
| G10 | **Invariant sweep** | for every cookie-bearing case: `res.status !== 200` **or** `typeof body.token === "string" && body.token.length > 0`. `200 {token:null}` with a session cookie is an automatic fail |
| G11 | Log hygiene | one line per failure; serialized log payload contains no token substring, no cookie value, no email/id, no `https://` URL |
| G12 | Guest path cost | guest case issues no `/token` and no `/get-session` fetch |

Server seam (`src/lib/db/server.test.ts` or a new `server.fail-closed.test.ts`):
| # | Case | Assertions |
|---|---|---|
| S1 | Cookie present, `/token` 429/5xx/network | `getSupabaseServerClient()` resolves a **degraded** client (`TOKEN_UNAVAILABLE` on read) and `dataApiRequests(captured)` is empty; `captured` contains **no** `/token/anonymous` request |
| S2 | Cookie present, `/token` 200 | Data API request carries `Authorization: Bearer <session jwt>` |
| S3 | No cookie | `/token/anonymous` is used; existing behaviour unchanged |

Client (`src/lib/db/token-cache.test.ts`):
| # | Case | Assertions |
|---|---|---|
| C1 | `503` | `getToken()` **rejects** with `code:"TOKEN_UNAVAILABLE"`; a second immediate call re-fetches (not memoised) |
| C2 | `401` | resolves `null` **and** the cache is dropped (next call re-fetches) |
| C3 | `200 {token:null}` | resolves `null` (guest) — unchanged |
| C4 | fetch rejects (offline / aborted) | rejects classified `TOKEN_UNAVAILABLE`; not memoised as `null` |

**Retargets (existing tests that pin the wrong behaviour):**
- `src/lib/db/token-cache.test.ts` → `"treats a failed token response as a guest instead of throwing"` —
  this test encodes the defect. Split: `!ok` with `503` ⇒ rejects (C1); `200 {token:null}` ⇒ `null` (C3).
- `src/lib/db/client.test.ts` — any assertion that a non-`ok` response yields a reusable `null` must be
  retargeted the same way.
- The eleven R2-5 `*.degraded.test.ts` suites (e.g. `api/progress/summary/route.degraded.test.ts`) MUST
  keep passing **unchanged** — the guest contract (200 + empty payload + `private, no-store`) is not
  modified by this contract, and `/api/progress/summary` for a cookie-bearing user whose mints both 429
  must still answer the empty 200, not a 5xx.

---

## 11. Acceptance criteria (implementation gate)

1. `GET /api/db/token` returns `200 {token:null}` **iff** the request carried no transport-correct session
   cookie; a cookie-bearing request never receives a `null` token (G10).
2. A cookie-bearing request with a failed mint gets `401 SESSION_INVALID` (upstream 401/403) or
   `503 AUTH_MINT_UNAVAILABLE` (everything else) — never `200`, never `403`, never `500`, never a redirect.
3. `getSupabaseServerClient()` never resolves an `anonymous`-role JWT when a session credential is present;
   it resolves the degraded client instead (S1). The `?? getAnonymousJwt()` fallback is unreachable for
   credential-bearing requests.
4. Guest requests still work end-to-end: `/api/db/token` → `200 {token:null}`, and public guest surfaces
   (`/atlas`, sitemap, learn visibility) use `getSupabaseAnonymousClient()` unchanged.
5. Every response of every branch carries `Cache-Control: private, no-store, no-cache, must-revalidate` and
   `Vary: Cookie`; errors are not cacheable; the route stays `force-dynamic`.
6. Failure responses contain only the §3 bodies: no upstream message, host, status, error class, token,
   cookie, or internal identifier (§4).
7. Exactly one structured, secret-free log line per failed request, none on `200` (§7); a serialized-log
   assertion proves no token/cookie/identity substring.
8. `Retry-After` is emitted (clamped `1..120`) whenever upstream or the cooldown supplied a wait, and
   omitted otherwise.
9. Client: `getToken()` rejects (classified, retryable) on `503` and on fetch rejection instead of returning
   `null`, never caches a failure, and drops the cache on `401` (§8, C1–C4).
10. All §10 tests present and green; the retargeted tests no longer pin "failure ⇒ guest"; `npm run test`,
    `npm run lint`, and `next build` are green. The R2-5 degraded suites are unchanged and still pass.
11. The implementation PR adds this contract (or a link to it) to `docs/decisions/2026-10-26-db-token-fail-closed-contract.md`
    so the behaviour is discoverable in-repo.

## 12. Non-goals

- Changing Managed Better Auth / Neon rate limits, or adding a new limiter to `/api/db/token` (same-origin,
  cookie-scoped; the upstream bucket already bounds it, and the cooldown is the local suppression).
- Introducing a service-role or server-side service key. Authorization stays "the request's own JWT".
- Redesigning `/api/auth/session` (it has the same null-collapse shape, but it is identity for UI gating,
  not a credential, and is out of scope here — noted as a follow-up candidate).
- Changing RLS policies.

## 13. Residual risks / operator notes

- **Shared rate-limit bucket.** `/token` and `/token/anonymous` share one bucket
  (`anonymous-token.ts:6-13`), so guest traffic can 429 a signed-in mint. After this change that surfaces
  as `503` + `Retry-After` (honest) instead of a silent guest read (dishonest). The R2 guest short-circuit
  (§10 G1) removes this route's guest traffic from the bucket — a real reduction in that contention.
- **Cooldown is process-local** (`MINT_COOLDOWN_MS`, `server.ts:144-147`). On a multi-instance deployment a
  request can still spend the full 800 ms budget per instance; the contract only requires that a `503` is
  returned *within* the existing budget, never that the cooldown is global.
- **Race:** the credential predicate and the mint read cookies independently but within one request scope;
  both read the same `next/headers` store, so they cannot disagree mid-request. Do not re-read cookies from
  a different source for the predicate.
- **Do not "fix" the 401 by returning 200 + null for expired sessions.** A signed-out-looking 200 is
  indistinguishable from a guest and is the original defect. Let the client clear identity explicitly.
- Perf: every branch is `no-store` and cheap; the guest branch gets *cheaper* (no upstream call).
