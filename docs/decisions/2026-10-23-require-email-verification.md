# Decision: `requireEmailVerification` at the Neon Auth cutover

- **Status:** ACCEPTED (policy), execution GATED — see §6
- **Date:** 2026-10-23
- **Decider:** brainiac (web solution architect)
- **Card:** t_a4565e53 — follow-up to R2-4 F1 (t_94bda24e, alpha)
- **Project/branch:** `dawn-darkness-89797362` / `production` (`br-small-tree-b7tw8byt`)
- **Config observed at decision time** (`neon_auth.project_config`, 2026-10-23T17:2xZ):

```
email_and_password.emailVerificationMethod      = "link"
email_and_password.requireEmailVerification     = false   <-- the toggle in question
email_and_password.sendVerificationEmailOnSignUp = true
email_and_password.sendVerificationEmailOnSignIn = false  <-- second toggle in question
email_and_password.autoSignInAfterVerification  = true
email_provider.type                             = "custom" (smtp.resend.com:465, no-reply@auth.adroit.io)
```

## 1. Decision

**Enable verification — `requireEmailVerification = true` — but not until two gates pass.**
Also flip **`sendVerificationEmailOnSignIn = true`** in the same call.

So: not "leave it false for cutover" (option 1), and not "flip at cutover as-is" (options 2/3 as
written). The card's option set assumed 19 stranded legacy identities; that premise is stale
(§2), and it missed the real blocker: **nothing in the app has ever been shown to redeem a
verification link** (§3, Gate 2). Flipping a gate the app cannot satisfy locks out every *new*
signup — the opposite of the lockout risk the card was worried about.

## 2. Recount: there are no stranded legacy identities

Live census of `neon_auth."user"` on the production branch, 2026-10-23T17:31Z:

```
total=11  verified=9  unverified=2  unverified_internal=2  unverified_fixture=0
```

| verified | who | first seen | app data |
|---|---|---|---|
| yes (8) | the Supabase-era identities (5 client/staff mailboxes + `qa.admin|member|granted@adroit.io`), imported with their original UUIDs by `005_identity_continuity.sql` | 2026-08-06 → 2026-09-09 | `chris.sympson` 612 lesson_completion + 612 quiz_attempt rows; `kelex1812` 3; rest 0 |
| yes (1) | `Steel F2 probe @adroit.io` | 2026-10-23 | 0 |
| **no (2)** | `Alpha R1-2 Probe @adroit.io`, `steel.qa.t_ab6c1cb6 @adroit.io` | 2026-10-23 | 0 roles, 0 entitlements, 0 lessons, 0 reads, 1–2 sessions each |

Why the card's 19/27 is stale: those were ~20 disposable `kelex1812+qa-*` fixture identities minted by
verification scripts (`scripts/verify-session-bridge.py`), including one holding `role=admin`. They are
being revoked under security card t_9aba2d2e (val-el), and by the time of this recount **0 fixture
identities remain**.

Consequence: the "19 users get locked out" risk is **zero for real users**. Every identity that maps to
a human, a customer, or a staff member is already `emailVerified = true`, and their `emailVerified`
came from the Supabase era, where the mailbox was proven by an actual confirmation click.

Extra safety margin that makes the flip strictly cheaper than it looks: imported identities were issued
an **unusable random password** (`005_identity_continuity.sql`, `scripts/import-legacy-identities.mjs`),
so every legacy user's first action is a **password reset** — a mandatory mailbox round-trip *before*
they can ever reach the sign-in gate. Verification states cannot lock out a user who has to prove the
mailbox anyway.

## 3. The real blocker: no proven verification round-trip

Searching the R2-1 branch (`origin/neon/auth-routes-t_d9a07839`, PR #358 — the code that will actually
run at cutover):

- `signUp.email` sets `callbackURL: buildVerifyEmailRedirect()` → **`https://adroit.io/field-notes`**
  (`src/lib/auth-emails.ts`), i.e. the emailed link is expected to land the user on a **signed-in**
  page.
- `src/app/api/auth/resend-confirmation/route.ts` calls `sendVerificationEmail` — sending is wired.
- **No `verifyEmail` call, and no route that consumes a verification token, exists anywhere in `src/`.**
  `src/app/auth/callback/route.ts` only forwards `?token=` to `/reset-password`.
- `/field-notes` is auth-gated: an unverified visitor with no session is bounced to `/login`.

The R2-4 evidence proves **delivery** (Resend `last_event: delivered`), and for password reset it also
proves **redemption** (302 → `/reset-password?token=…`, and the token is redeemed by
`/api/auth/reset-password/update`). Nothing equivalent exists for verification. Two possible truths:

1. Neon's link points at the Managed Better Auth host, which verifies server-side and 302s to
   `callbackURL` (the documented "the Managed Better Auth server handles verification and redirects them
   back to your application" behaviour). Then the flip is safe with no code change — but the session
   cookie is set on the auth host, so the user lands on `/field-notes` and must sign in again.
2. The link appends `?token=` to `callbackURL` and expects the client to redeem it (the pattern this
   codebase already implements for reset). Then `/field-notes?token=…` verifies nothing, `emailVerified`
   stays `false`, and with `requireEmailVerification=true` **every new signup is permanently locked out**
   — a perfect login loop: `/field-notes` → `/login` → `403 EMAIL_NOT_VERIFIED` → resend → `/field-notes`.

We have not proven which. Flipping on an unproven redemption path is exactly the kind of auth-policy bet
that is invisible until it is a support incident. Hence **Gate 2** below: a disposable probe account
proves the round-trip *while the toggle is still false*, at zero user risk.

## 4. Why verify at all (the case for flipping)

1. **Authorization keys on identity continuity.** `005_identity_continuity.sql` is explicit that real
   authorization (roles, entitlements) is carried by the identity row, and that reconciliation must
   never be by email because "whoever controls a staff address" could inherit a role. With verification
   off, `emailVerified` is a dead field and unverified sign-ups are a standing class of identity risk.
2. **It closes val-el's finding F2 (`CWE-204`, EMAIL_NOT_VERIFIED oracle).** Today an unverified
   sign-in succeeds (200 + token) because the flag is false, which is why the oracle "was not
   reproducible" in the R2-1 re-verify (t_143fa201). With verification required, the app's fixed
   403 + generic message path (`src/app/api/auth/login/route.ts`, `isUnconfirmed()`) becomes the
   only response shape — the non-enumerating design that was built for this in t_be6b4bd2 finally runs.
3. **The UX already exists.** Login page renders the unconfirmed state with a resend action
   (ADR-PWR-4); `resend-confirmation` is origin-checked, rate-limited, and non-enumerating. There is no
   product work to do to "support" the flip.
4. **Cost of late flip is higher.** Turning verification on after a few hundred unverified accounts
   exist is a comms campaign. Today it is a two-identity cleanup.

## 5. Why `sendVerificationEmailOnSignIn = true` (the second toggle)

Verification links expire (Neon docs: 15 minutes; our reset tokens are 1 h, verification tokens are
shorter-lived). A user who registers, closes the tab, and tries to sign in an hour later otherwise hits
a dead end and must find the resend control. With the flag on, the *first failed sign-in* re-sends a
fresh link automatically. Fluency-by-default, no enumeration cost: Better Auth only sends after the
password check succeeds, and the app already collapses the response to a fixed 403.

## 6. Gates and execution

### Gate 1 — code is live (owner: alpha, blocking)

`POST https://adroit.io/api/auth/login` with bogus credentials returned **HTTP 500**
`{"error":"Something went wrong. Please try again."}` at 2026-10-23T17:2xZ, while `GET
/api/auth/session` returns 200 `{"user":null}`. Main (`054b2fad`) still authenticates through
`@supabase/ssr` reading `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, and those keys were removed from Vercel in
t_601871d5; PR **#358** (Neon R2-1: swap auth routes to Managed Better Auth) is still **open**. So the
cutover has not actually landed: auth config changes have no user-visible effect until #358 merges,
deploys, and a real sign-in returns 200. This is a cutover blocker independent of this decision.

### Gate 2 — verification round-trip proven (owner: alpha, blocking, zero user risk)

With `requireEmailVerification` still **false**:

1. Pick one disposable probe identity (currently `Alpha R1-2 Probe @adroit.io`, unverified).
2. Trigger a verification email for it (`POST /api/auth/resend-confirmation` through the app, so the
   real link is generated).
3. Open the link and record: the URL host/path, the redirect target, and whether the user lands
   signed-in on `/field-notes`.
4. Re-read `neon_auth."user"."emailVerified"` for that id.

- **Pass** (link verifies server-side, `emailVerified` flips to `true`): proceed to Gate 3.
- **Fail** (`emailVerified` stays `false`, or the link lands on a page that does nothing): **do not
  flip.** File a steel card for the missing redemption path — either a `/field-notes` token consumer
  that calls `getAuthServer().verifyEmail({ query: { token } })` and then forwards to the clean URL, or
  point `buildVerifyEmailRedirect()` at a dedicated `/auth/verify` route that does the same. The flip
  then waits behind that card. This is the only piece of work standing between "optional" and "required".

### Gate 3 — census re-check immediately before the flip (owner: alpha)

Counts drift whenever a script signs up a probe. Run this at flip time and require
`unverified = unverified_internal` (the only allowed unverified identities are internal `@adroit.io`
probes) and `unverified_fixture = 0`:

```sql
select
  count(*)                                              as total,
  count(*) filter (where "emailVerified")             as verified,
  count(*) filter (where not "emailVerified")          as unverified,
  count(*) filter (where not "emailVerified" and email like '%@adroit.io') as unverified_internal,
  count(*) filter (where not "emailVerified" and email like 'kelex1812+%')    as unverified_fixture
from neon_auth."user";
```

If a non-internal, non-fixture identity shows up unverified, stop and route it to a human decision
(it would be a real mailbox that never confirmed).

### Gate 4 — flip (owner: alpha), then re-verify (owner: zod)

```bash
neon neon-auth config email-password update \
  --project-id dawn-darkness-89797362 \
  --branch production \
  --require-email-verification true \
  --send-verification-email-on-sign-in true
```

Confirm with `select jsonb_pretty(to_jsonb(c)->'email_and_password') from neon_auth.project_config c;`
before and after. Keep **one** unverified internal probe alive as the canary for zod's post-flip test;
delete it (and its `session`/`account` rows, per t_9aba2d2e's delete order) once verified.
`qa.admin@adroit.io`, `qa.member@adroit.io`, `qa.granted@adroit.io` are intentional and stay.

## 7. Acceptance criteria for zod's re-verification

1. **Verified legacy user, new password, signs in** → `POST /api/auth/login` 200 `{"status":"ok"}` and
   `GET /api/auth/session` returns that user (use the password-reset path for an imported identity, not
   a remembered password — imported credentials are unusable by design).
2. **Unverified canary signs in with a correct password** → **403**, body exactly
   `"Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below."`
   (no upstream code/message echoed), and a fresh verification email is delivered
   (`last_event: delivered`) without calling resend explicitly — that is `sendVerificationEmailOnSignIn`
   doing its job.
3. **Resend path** → `POST /api/auth/resend-confirmation` 200 with the generic message, email delivered.
4. **New signup** → `signUp` returns `check-email`; the identity is `emailVerified = false`; sign-in
   before clicking is 403; after clicking the emailed link, `emailVerified = true` and sign-in is 200.
5. **No enumeration regression** → unknown email and wrong password both still 401
   `"Invalid email or password."`
6. **Admin path unaffected** → an admin (`chris.sympson`, `juliannemsward`) still reaches
   `/api/admin/users` 200.

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Verification link has no redemption path → all new signups locked out | Unknown, unproven either way | Gate 2 proves it while the toggle is false; steel card filed if it fails |
| Config flipped while prod auth is 500 (PR #358 open) → nobody notices the gate is broken | High today | Gate 1: flip only after a real sign-in returns 200 on production |
| Re-verification impossible for legacy users whose mailbox is dead | Low | They are already `emailVerified = true` and may reset or contact support; no new lockout created by the flip |
| A future verification-script run mints a new unverified identity after the flip | Medium | Gate 3 census at flip time + t_9aba2d2e's production guard on `scripts/verify-*.py`; `--allow-live-db` only off-host |
| `sendVerificationEmailOnSignIn` mail-bomb / Resend quota | Low | Fires only after a correct password; Resend domain-scoped key; add a per-address resend throttle if volume appears (rate limiting already exists per-IP) |
| Verification email lands in spam (default Neon template, `DMARC p=none`) | Medium | Already flagged in the migration plan §risks; revisit branded templates via webhook after cutover |

## 9. What was deliberately not done here

- No config change was made by this card. `requireEmailVerification` is still `false` and
  `sendVerificationEmailOnSignIn` is still `false` — the flip is alpha's, behind Gates 1–3.
- No identities were deleted by this card. The two unverified probes are alpha's to clean up per
  t_9aba2d2e.

## 10. Execution record (alpha, 2026-10-23T17:35Z–18:50Z)

**Gate 1 — PASS.** Production `992f61c7` is `origin/main` after PR #361 and contains `78772f80`
(*swap auth routes to Managed Better Auth*); PR #358 is superseded (state OPEN, `DIRTY`) and was not the
vehicle. Live proof: `POST /api/auth/login` with bogus credentials → 401 `"Invalid email or password."`
(no longer 500), and a real credential sign-in for a throwaway `@adroit.io` identity →
**200 `{"status":"ok"}`** with `__Secure-neon-auth.session_token` + `session_data` cookies, then
`GET /api/auth/session` → `{"user":{"id":…,"isAdmin":false}}`.

**Gate 2 — PASS** (run before the flip, flag still false): the emailed verification link is
`https://ep-noisy-glade-b7jpeudp.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth/verify-email?token=…&callbackURL=https%3A%2F%2Fadroit.io%2Ffield-notes`;
`GET` on it returns **302 → `https://adroit.io/field-notes`** and `emailVerified` false → **true**.
Hypothesis #1 in §3 holds: the auth host redeems the token server-side, so no app-side token consumer is
needed. The session cookie is issued on the auth host, so the browser lands on `/field-notes` without an
app session — a second sign-in is required, as predicted (acceptable).

**Gate 3 — PASS at flip time.** Leftover QA fixtures minted by in-flight verification scripts after
t_9aba2d2e (`kelex1812+steel-hydr2`, `kelex1812+qa-bridge-*`, `kelex1812+qa-bridge-zod-*`,
`chris.sympson+qa-r24-admin`, `qa.r24.zod@example.com`) were revoked in the t_9aba2d2e order
(`session` → `account` → `public.user_roles`/`user_entitlements`/`user_profiles`/`"user"` →
`neon_auth."user"`). Census immediately before the flip:

```
total=10  verified=10  unverified=0  unverified_internal=0  unverified_fixture=0
```

**Gate 4 — FLIPPED, verified in the database (not the CLI's echo).**

```json
// before: {"requireEmailVerification": false, "sendVerificationEmailOnSignIn": false}
// after:
{"enabled": true, "disableSignUp": false, "emailVerificationMethod": "link",
 "requireEmailVerification": true, "autoSignInAfterVerification": true,
 "sendVerificationEmailOnSignIn": true, "sendVerificationEmailOnSignUp": true}
```

One unverified internal `@adroit.io` canary was created for zod (`alpha.canary.<ts>@adroit.io`, id in
card t_34b5889c) and left unverified.

**Open finding from execution (routed to steel).** The gate itself works — an unverified identity can no
longer sign in — but the app answers **401 `"Invalid email or password."`**, not the designed
403/recovery response of §7 criterion 2. The auth host correctly returns
`403 {"message":"Email not verified","code":"EMAIL_NOT_VERIFIED"}`. `@neondatabase/auth@0.7.0-beta`
normalizes that through `BETTER_AUTH_ERROR_MAP` (`EMAIL_NOT_VERIFIED` → `email_not_confirmed`) and
`normalizeBetterAuthError()` replaces the message with the canned `"Email verification required"`
(status 422), so `isUnconfirmed()` in `src/app/api/auth/login/route.ts` matches neither
`code.includes("EMAIL_NOT_VERIFIED")` nor `/not[_ ]verified|confirm/i`. The predicate must also accept the
SDK's normalized code (`email_not_confirmed`) and its `status` (422/403) — otherwise the unconfirmed
sign-in path silently degrades to the generic credentials error and the resend-on-sign-in UX is
unreachable.
