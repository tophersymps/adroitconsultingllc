### QA test-user helper moved to Neon Managed Better Auth (qa-test-user-neon)

**What** - `scripts/qa-create-test-user.cjs` no longer calls the Supabase GoTrue admin API. It now signs
the identity up through `POST {NEON_AUTH_BASE_URL}/sign-up/email` with a trusted `Origin` header, marks
`emailVerified` over `DATABASE_URL`, asserts the eager trigger mirrored the row into `public."user"`,
proves the credentials by calling `/sign-in/email`, and only then prints them. `--delete` removes the
session, account, `public."user"` and `neon_auth."user"` rows.

**Why** - after the 2026-10-23 cutover the script's only code path was the GoTrue admin REST API on the
retired Supabase project, so QA could not create a test user at all. The failure was silent in the sense
that it looked like a product signup problem rather than a stale helper.

**Verified** - `node scripts/qa-create-test-user.cjs neon-smoke` returned
`{"created":true,"verified":true,"public_user_rows":1,"sign_in":"ok"}`; a second run reused the identity
(`created:false`, `emails_sent:0`); `POST https://adroit.io/api/auth/login` with those credentials
returned HTTP 200 and set `__Secure-neon-auth.session_token`; `--delete` removed 1 auth user, 1 account,
3 sessions and 1 `public."user"` row, and follow-up counts were 0 in all three tables.

**Known Issues** - Creation still sends one verification email, because the password hash is produced by
the auth service and cannot be fabricated over SQL. The send goes to a real plus-addressed inbox
(`kelex1812+qa-<label>@gmail.com`) so it cannot bounce. `requireEmailVerification` is now `true` in
`neon_auth.project_config`, which is why the script sets the verified flag itself.
