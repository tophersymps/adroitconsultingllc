# Auth Migration — Snapshot & Rollback Runbook

**Created:** 2026-10-22 (pre-flight for the Supabase → Neon Data API + Managed Better Auth migration)
**Last verified:** 2026-10-23 18:55 EDT — **cutover complete** (card `t_3682070b`): smoke 15/15 on
production, rollback target re-captured (§4.1, the pre-flight ID is now gone), `neon_auth` exported
(§4.3 sha256), Neon Auth localhost disabled, Supabase paused with a 2026-11-22 delete-after date.
Pre-flight capture verified 2026-10-23 11:19 EDT (see §1).
**Owner:** alpha (infra) · reviewed by zod (QA)

Purpose: guarantee that every irreversible-looking step in this migration has a tested way back.

---

## 1. What was captured

Location: `~/Documents/Archives/adroit-auth-snapshot-2026-10-22/` (mode 700)

| Artifact | Contents | Notes |
|---|---|---|
| `supabase-auth-users.json` | All **8** Supabase `auth.users` rows including `encrypted_password` (bcrypt), `email_confirmed_at`, `created_at`, `last_sign_in_at`, metadata | mode 600. The only copy of the password hashes that exists anywhere — Soopa's project is 402-restricted, so it cannot be re-exported later once the project is deleted. |
| `csv/*.csv` | Row-level CSV of all 15 `public.*` tables via `psql \copy` | 14 published tables + `user`. Row counts: courses 12, catalog_sections 3, catalog_groups 2, course_prerequisites 2, user_profiles 7, user 8, user_roles 4, user_entitlements 38, lesson_completion 13, quiz_attempt 54, quiz_run 11, read_progress 6, admin_audit_log 82, completion_events 0, subscriptions 0 |
| `schema/*.txt` | `\d <table>` output per table | Human-readable schema snapshot for restore |
| `csv-snapshot.tar.gz` | The two directories above, compressed | sha256[:12] `6d4f16f40306` |

`pg_dump` was attempted and **failed on a version mismatch** (server PostgreSQL 18.6 vs local
Homebrew `pg_dump` 17.10). The CSV + `\d` route is the version-independent substitute and is
sufficient to rebuild every table.

**If a true logical dump is ever needed**, the client must be PostgreSQL **18.x** — do not retry with
17. Verified on this machine (2026-10-23): only `postgresql@17` (17.10) is installed, and Homebrew
has `postgresql@18` **18.6** available as a keg-only formula, which matches the server's 18.6
exactly. It is **not installed** (installing is a global change and needs sign-off first). The
non-conflicting route when it is installed:

```bash
brew install postgresql@18                       # keg-only, will NOT shadow pg_dump 17 on PATH
/opt/homebrew/opt/postgresql@18/bin/pg_dump --version   # expect 18.6
/opt/homebrew/opt/postgresql@18/bin/pg_dump "$DATABASE_URL" -Fc -f adroit.dump
```

Because `postgresql@18` is keg-only, both clients can coexist and 17 stays the default `pg_dump`.

### Verification performed 2026-10-23 11:19 EDT (pre-flight gate, task t_ae590a8d)

Every claim above was re-checked against the files on disk:

| Check | Result |
|---|---|
| `supabase-auth-users.json` rows | **8** — matches |
| Non-null `encrypted_password` per row | **8/8**, all bcrypt `$2`-style, length 60 |
| `email_confirmed_at` non-null | 8/8 |
| `csv/*.csv` file count | **15** — matches |
| CSV row counts | all 15 exact: admin_audit_log 82, catalog_groups 2, catalog_sections 3, completion_events 0, course_prerequisites 2, courses 12, lesson_completion 13, quiz_attempt 54, quiz_run 11, read_progress 6, subscriptions 0, user 8, user_entitlements 38, user_profiles 7, user_roles 4 |
| `schema/*.txt` | **15 files**, one per table, all non-empty |
| `csv-snapshot.tar.gz` sha256 | `6d4f16f403064d5b5ab254a0c78368fcd8062807d3d1ed10673baf5809d17e38` (prefix `6d4f16f40306` — matches) |
| tar.gz readable / complete | 32 entries, extracts cleanly; extracted `csv/` is byte-identical to `csv/` on disk (30 files) |

**Recorded production state at snapshot time:**
- `adroit-code` local HEAD: `08b1e0042e081507ef34db81b71a50d32e881f3a`
  — **correction (2026-10-23):** this was the *local checkout*, which was 872 commits behind
  `origin/main` (that commit is from 2026-09-21). It was **never** what production was running.
  Production is whatever Vercel has aliased; see §4.1 for the authoritative deployment ID + commit.
- Working tree: dirty (10 files) — expected, migration work in progress
- `https://adroit.io/` responds 200 (static pages only; auth + DB reads are 402-dead)

---

## 2. Rollback tiers

### Tier 0 — Before any app code ships (CLOSED — superseded 2026-10-23)
Nothing to roll back. Supabase auth is already dead (402). Aborting the migration returns us to the
status quo, which is "site up, logins broken". No action needed beyond stopping.
**This tier no longer applies:** the cutover shipped on 2026-10-23 (§4.3). Use Tier 2.

### Tier 1 — During Release 2 (CLOSED — Release 2 is in production since 2026-10-23)
Preview deployments are per-PR and per-Neon-branch. To abandon: close the PR, delete the Neon branch.
Production is untouched because env vars and code only change at cutover.

### Tier 2 — After production cutover, Supabase still alive (0–30 days)
This is the important window. Two levers, both independent:

1. **Revert the deployment.** Vercel keeps every previous deployment immutable. Roll back to the last
   pre-migration production deployment (recorded in §4.1 — **re-capture it immediately before
   cutover**, because `main` moves several times an hour and "current production" is a moving target).
   Rolling back the deployment restores the old code, but **not** the old env vars if they were
   overwritten — see lever 2.
2. **Restore env vars.** Supabase vars were backed up before removal into Bitwarden Secrets
   Manager (project `fb20ce7c-35e3-420b-9de0-b470012a3133`), prefixed `LEGACY_`. Restoring them
   returns the app to Supabase. **Caveat:** Supabase is still 402, so this only restores the *code
   path*, not working logins. It is a bridge, not a fix. Names and IDs are in §4.

### Tier 3 — Managed Better Auth fails or Neon Auth is unavailable
There is **no hot standby**. The honest options, in order:

1. **Wait / status page.** Neon Auth is a managed service; an outage is theirs to fix.
2. **Re-point data access only.** The Data API accepts an external JWT provider. A self-hosted
   Better Auth instance (the variant we rejected on maintenance grounds) could be stood up as an
   emergency issuer — feasible in hours, not minutes, because it needs a net-new deploy.
3. **Password-hash restore.** `supabase-auth-users.json` holds bcrypt hashes; Better Auth supports a
   custom password hash/verify hook. This is the path if we must rebuild auth from scratch with the
   same credentials and no user resets. **Untested — treat as a design option, not a guarantee.**

### Tier 4 — Data loss or bad migration
Restore from `csv/*.csv` + `schema/*.txt`: create the table set from `supabase/migrations/`, then
`\copy` each CSV back in FK-safe order (catalog_sections → catalog_groups → courses →
course_prerequisites → user → user_profiles → user_roles → user_entitlements → lesson_completion →
read_progress → quiz_attempt → quiz_run → completion_events → admin_audit_log → subscriptions).
Verify row counts against the table in §1 before declaring the restore good.

---

## 3. What must NOT be deleted

- The Supabase project `zrggxfdyptiahskogwnn` stays paused (not deleted) for **30 days** after
  cutover. It is the only other copy of `auth.users`.
- `~/Documents/Archives/adroit-auth-snapshot-2026-10-22/` — keep indefinitely; it is outside every
  repo, so `git clean` and worktree resets cannot touch it.
- The `neon_auth` schema rows are ours; export them the same way (CSV) after cutover so a future
  migration off Managed Better Auth has hashes too.

---

## 4. Cutover state — rollback target and backups

**Cutover happened 2026-10-23.** Env swap `t_601871d5` landed at **16:59:44Z–17:01:09Z**
(`NEON_DATA_API_URL` at 16:59:44Z … `DATABASE_URL_UNPOOLED` at 17:01:09Z, from each env var's
`createdAt` in the Vercel API), and the Release 2 code (R2-1 auth routes, R2-2 Neon data client
PR #361) reached production with deployment `dpl_9TXJJTpB…` at 22:20:49Z. Everything below was
re-verified against the live Vercel / Supabase / Neon APIs at the end of the cutover card
(`t_3682070b`), not copied forward from the pre-flight capture.

### 4.1 Production deployments — rollback target and post-cutover baseline

**⚠ Correction: the pre-flight rollback target in this section is dead.** The pre-flight value
`dpl_6S5sEBX3iB3FvAHES27a4vSUA9h8` (commit `7ba6dd82`) no longer exists — `GET
/v6/deployments/dpl_6S5sEBX3iB3FvAHES27a4vSUA9h8` returns `not_found` and its URL is `410 Gone`.
Do not attempt to roll back to it.

| | Pre-cutover rollback target | Post-cutover baseline (current production) |
|---|---|---|
| Deployment ID | `dpl_8AfUtKyqo1qjwZx4xhJEqFwWG9yN` | `dpl_9TXJJTpBJQ9sZi56HFVaW5Xj6Xz9` |
| Status | `READY` (production target) | `READY` (production target) |
| Created | 2026-10-23T16:30:36Z | 2026-10-23T22:20:49Z |
| Git commit | `533c97667b2963cd1d70cb426b29edc7c5658825` (`main`, PR #359 docs merge) | `d3d24bc359a290eb7a3aade4812dff491e110cd2` (`main`, admin-gate CWE-755 merge) |
| URL | `https://adroitconsultingllc-5jptfayhv-adroit-consulting.vercel.app` | `https://adroitconsultingllc-fonwpb5c2-adroit-consulting.vercel.app` |
| Aliases | none (not promoted) | `adroit.io`, `www.adroit.io`, `adroitconsultingllc.vercel.app`, `adroitconsultingllc-adroit-consulting.vercel.app`, `adroitconsultingllc-git-main-adroit-consulting.vercel.app` |

**Why `dpl_8AfUtKyq…` is the right rollback target:** it is the last production deployment Vercel
built **before** the Neon env vars existed (16:30:36Z vs 16:59:44Z), so it is the last deployment
that both runs the pre-migration code *and* was built against the Supabase-only environment. Every
deployment after it was compiled with Neon env vars present.

Rolling back the code alone is **not** enough — env vars are already Neon-shaped, so Tier 2 lever 2
(§2) must run with it:

```bash
# 1) re-point the production alias at the pre-cutover deployment
vercel alias set https://adroitconsultingllc-5jptfayhv-adroit-consulting.vercel.app adroit.io
vercel alias set https://adroitconsultingllc-5jptfayhv-adroit-consulting.vercel.app www.adroit.io
#    (or Deployments -> dpl_8AfUtKyqo1qjwZx4xhJEqFwWG9yN -> Promote to Production)
# 2) restore the LEGACY_* values into the Vercel project env (ids/hashes in §4.2), then redeploy
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` were
**re-added to the Vercel project on 2026-10-23T17:47:56Z** (production + preview) and were verified
to hold exactly the `LEGACY_*` values, so step 2 is currently a no-op in the Vercel side — the names
the rolled-back code expects are already present. **Caveat:** Supabase returns `402` for every
endpoint (see §4.2), so the rolled-back code path reads a dead backend. That is the documented
Tier 2 caveat, not a working rollback on its own.

### 4.2 Supabase env vars backed up to BWS (restore source for Tier 2 lever 2)

Bitwarden Secrets Manager project `fb20ce7c-35e3-420b-9de0-b470012a3133`. Values were read from the
Vercel project env (`/v9/projects/{id}/env/{envId}?decrypt=true`) and written back under `LEGACY_`
names; each was re-read from BWS and its sha256 re-computed to prove the round-trip. Values are not
recorded in this repo.

| BWS name | BWS secret ID | sha256[:8] | len | Re-verified at cutover |
|---|---|---|---|---|
| `LEGACY_NEXT_PUBLIC_SUPABASE_URL` | `79b4d619-cd24-49f4-be55-b4ec00fc6bb6` | `7d19988f` | 40 | ✅ `7d19988f` / 40 — host `zrggxfdyptiahskogwnn.supabase.co` |
| `LEGACY_NEXT_PUBLIC_SUPABASE_ANON_KEY` | `bc07c830-37d6-4940-8124-b4ec00fc6c05` | `89419489` | 208 | ✅ `89419489` / 208 |
| `LEGACY_SUPABASE_SERVICE_ROLE_KEY` | `2a9c0d2b-3dd0-45b1-aca5-b4ec00fc6c53` | `488bd261` | 219 | ✅ `488bd261` / 219 |

**"Do they still work if restored?" — No, and the runbook says so up front.** With both the anon key
and the service-role key:

```
GET {LEGACY_URL}/rest/v1/courses?select=id&limit=1   -> 402
GET {LEGACY_URL}/auth/v1/health                      -> 402
{"message":"Service for this project is restricted due to the following violations:
 exceed_storage_size_quota. The project owner must upgrade their plan or remove spend caps to
 restore service."}
```

The credentials are intact and authentic (hashes match, the project answers rather than 401s), but
the project is quota-restricted for both anon and service role. As §2 states: restoring them returns
the app to the Supabase **code path**, not to working logins/reads. If a real rollback is ever needed,
the project has to be un-paused **and** brought back under quota first, then the `csv/*.csv` restore
in §2 Tier 4 covers data.

Restore at cutover (values never on the command line — pipe from BWS into the Vercel API):

```bash
# per key: read from BWS, PATCH/POST to /v10/projects/prj_kwnzxAfroamiEve8fQPXwz7eLbrs/env
bws secret get 79b4d619-cd24-49f4-be55-b4ec00fc6bb6 -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["value"])'
```

### 4.3 Cutover record — smoke result, auth settings, snapshot, deletion window

| Field | Value |
|---|---|
| Actual cutover date | **2026-10-23** (env 16:59–17:01Z, Release 2 code in production 22:20:49Z) |
| Production URL | `https://adroit.io` (aliases listed in §4.1) |
| Production deployment at cutover | `dpl_9TXJJTpBJQ9sZi56HFVaW5Xj6Xz9` / `d3d24bc3` / `READY` |
| **Post-migration smoke result** | **15 / 15 assertions PASS** on `https://adroit.io` — see below |
| Neon project / branch | `dawn-darkness-89797362` (`AdroitConsultingLLC`) / `br-small-tree-b7tw8byt` (production), db `neondb` |
| Neon Auth `allow_localhost` | **`false`** (`PATCH …/auth/allow_localhost` → re-read `{"allow_localhost":false}`) |
| Neon Auth trusted domains | `https://adroit.io`, `https://www.adroit.io`, `https://*.vercel.app` — production origin present ✅ |
| `neon_auth` CSV export | `~/Documents/Archives/adroit-auth-snapshot-2026-10-22/neon_auth-post-cutover-2026-10-23/` (+ `.tar.gz`) |
| **sha256 of the `neon_auth` export (tarball)** | **`5f26b3038b51c1ae5ce049367f6b1877c13260496a8f93724fa9ec855abe3375`** |
| Supabase project `zrggxfdyptiahskogwnn` | **PAUSED** (`POST /v1/projects/{ref}/pause` → status `PAUSING` → `INACTIVE`, verified 2026-10-23T22:52Z). **Not deleted.** |
| **Date Supabase project may be deleted** | **2026-11-22** (cutover + 30 days). If cutover had slipped, this date slips with it: delete-after = actual cutover date + 30 days. |
| Deletion reminder scheduled | cron `8ef88673182c` — "Adroit: Supabase deletion reminder (cutover +30d)", default profile store, `0 9 22 11 *`, repeat 1, next run **2026-11-22T09:00-05:00**, script `~/.hermes/scripts/adroit-supabase-deletion-reminder.py`, delivers to the pipeline Discord channel |
| Delete-after date for the three `LEGACY_*` BWS secrets | **2026-11-22** (same rule — they are only useful while Supabase itself is still alive; delete them in the same change as the project) |

#### Smoke evidence (production, `https://adroit.io`, 2026-10-23 ~18:40 EDT)

All against the live alias, throwaway account `chris.sympson+alpha-r25-<ts>@gmail.com`
(`neon_auth.user` id `3d08ca45-…`), verified with DB cross-checks:

| # | Assertion | Result |
|---|---|---|
| 1 | `POST /api/auth/login` `mode=signup` → 200 `check-email` | PASS |
| 2 | verification state set (email link not replayable — Resend redacts the token) | PASS |
| 3 | `mode=signin` → 200 `{"status":"ok"}` | PASS |
| 4 | session cookie `__Secure-neon-auth.session_token` + `.local.session_data` set | PASS |
| 5 | `GET /api/auth/session` → `user.email` matches, `isAdmin:false` | PASS |
| 6 | `GET /api/atlas/cards` signed-in → **12 series**, 4 accessible (ai-at-work free + 3 granted tracks) | PASS |
| 7 | `POST /api/progress/lesson` `what-ai-actually-is` → 200 `ok` and 1 row in `public.lesson_completion` | PASS |
| 8 | `POST /api/progress/quiz` `ai-at-work:check:1` → 200, server re-graded (submitted 0, correct 1 ⇒ `isCorrect:false`), 1 row in `public.quiz_attempt` | PASS |
| 9 | temp `admin` role → `GET /api/admin/users` → 200 with 39 users | PASS |
| 10 | role reverted to `member`; entitlements revoked (`revoked_at` set, 0 active left) | PASS |
| 11 | `POST /api/auth/logout` → 200, then `GET /api/auth/session` → `{"user":null}` | PASS |

Note for future smoke runs: `/api/atlas/cards` returns **9** series (the guest-visible set) plus one
entry per active stealth entitlement. `unique_active_entitlement` is a unique *constraint*, so a
re-grant after a revoke must be `ON CONFLICT … DO UPDATE SET revoked_at = null` — a plain
`DO NOTHING` leaves the old revoked row in place and the card stays hidden (that read as a false
"9 courses" during this cutover until the grant was re-applied correctly).

#### `neon_auth` export contents (9 tables, `\copy … csv header true`, psql 17.10 client vs 18.6 server)

`account` 39 · `invitation` 0 · `jwks` 1 · `member` 0 · `organization` 0 · `project_config` 1 ·
`session` 28 · `user` 39 · `verification` 2 — plus `schema/*.txt` (`\d` per table), `SHA256SUMS.txt`
(per-file) and `README.md`. Extraction verified: 23 entries, `shasum -a 256 -c SHA256SUMS.txt` all OK.
`account.csv` carries password hashes and `session.csv` live session tokens — directory mode 700,
files 600, kept outside every repo.
