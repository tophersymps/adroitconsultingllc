# Auth Migration — Snapshot & Rollback Runbook

**Created:** 2026-10-22 (pre-flight for the Supabase → Neon Data API + Managed Better Auth migration)
**Last verified:** 2026-10-23 11:19 EDT — snapshot artifacts re-checked on disk, rollback deployment ID
captured, Supabase env vars backed up to BWS (see §1 verification table and §4)
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

### Tier 0 — Before any app code ships (current state)
Nothing to roll back. Supabase auth is already dead (402). Aborting the migration returns us to the
status quo, which is "site up, logins broken". No action needed beyond stopping.

### Tier 1 — During Release 2 (app code swapped, preview only)
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

### 4.1 Pre-migration production deployment (rollback target)

Captured **2026-10-23 11:19 EDT / 15:19Z**, before any migration change was made to production.

| Field | Value |
|---|---|
| Deployment ID | `dpl_6S5sEBX3iB3FvAHES27a4vSUA9h8` |
| Status | `READY` |
| Created | 2026-10-23T14:10:47Z (10:10 EDT) |
| URL | `https://adroitconsultingllc-9rgjwasxl-adroit-consulting.vercel.app` |
| Serves | `adroit.io`, `www.adroit.io`, `adroitconsultingllc.vercel.app` (aliases confirmed via `/v2/deployments/{id}/aliases`) |
| Git commit | `7ba6dd82bdfff1b1730cf74fe279b42546075ccf` (`main`) |
| Project | `adroitconsultingllc` — `prj_kwnzxAfroamiEve8fQPXwz7eLbrs` |

Rollback (either form works; naming the deployment ID is what matters):

```bash
vercel alias set https://adroitconsultingllc-9rgjwasxl-adroit-consulting.vercel.app adroit.io
# or, from the Vercel dashboard: Deployments -> dpl_6S5sEBX3iB3FvAHES27a4vSUA9h8 -> Promote to Production
```

> **Caveat — this target moves.** `main` is auto-committed by the blog/audio crons on a minutes
> scale, so a "current production deployment" captured today is only meaningful until the next
> production deploy lands. **Re-capture this ID immediately before running the cutover** and replace
> the table above; do not rely on the 2026-10-23 value on cutover day. The commit sha is recorded so
> the deployment can always be re-identified.

### 4.2 Supabase env vars backed up to BWS (restore source for Tier 2 lever 2)

Bitwarden Secrets Manager project `fb20ce7c-35e3-420b-9de0-b470012a3133`. Values were read from the
Vercel project env (`/v9/projects/{id}/env/{envId}?decrypt=true`) and written back under `LEGACY_`
names; each was re-read from BWS and its sha256 re-computed to prove the round-trip. Values are not
recorded in this repo.

| BWS name | BWS secret ID | sha256[:8] | len | Vercel targets it was in |
|---|---|---|---|---|
| `LEGACY_NEXT_PUBLIC_SUPABASE_URL` | `79b4d619-cd24-49f4-be55-b4ec00fc6bb6` | `7d19988f` | 40 | preview, production |
| `LEGACY_NEXT_PUBLIC_SUPABASE_ANON_KEY` | `bc07c830-37d6-4940-8124-b4ec00fc6c05` | `89419489` | 208 | preview, production |
| `LEGACY_SUPABASE_SERVICE_ROLE_KEY` | `2a9c0d2b-3dd0-45b1-aca5-b4ec00fc6c53` | `488bd261` | 219 | production |

Restore at cutover (values never on the command line — pipe from BWS into the Vercel API):

```bash
# per key: read from BWS, PATCH/POST to /v10/projects/prj_kwnzxAfroamiEve8fQPXwz7eLbrs/env
bws secret get 79b4d619-cd24-49f4-be55-b4ec00fc6bb6 -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["value"])'
```

### 4.3 Remaining fields — fill at cutover

- Post-migration smoke result: `<pending — fill at cutover>`
- Actual cutover date: `<pending>`
- **Date Supabase project `zrggxfdyptiahskogwnn` may be deleted: 2026-11-22.** That is the earliest
  legal date — cutover 2026-10-23 + 30 days per §3 and Phase 5 of the plan. **If cutover slips, the
  date slips with it: delete-after = actual cutover date + 30 days.** Do not delete before the date
  in this line, and do not delete at all until `LEGACY_*` and the local snapshot have been re-verified
  reachable.
- Delete-after date for the three `LEGACY_*` BWS secrets: **2026-11-22** (same rule — cutover + 30
  days; they are only useful while Supabase itself is still alive).
- sha256 of the post-cutover `neon_auth` CSV export: `<pending>`
