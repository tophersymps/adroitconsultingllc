# Supabase decommission — what was archived and why

Cutover to Neon Postgres + Managed Better Auth + Neon Data API happened on 2026-10-23.
The Supabase project `zrggxfdyptiahskogwnn` stays paused/snapshot-only for 30 days
(data snapshot already in Neon), then gets deleted. Nothing in this repo should talk
to `*.supabase.co` any more; the audio dual-write to Supabase Storage was already off
(`AUDIO_DUAL_WRITE_SUPABASE=false` in `adroit-site-copy/.env.local`, R2 is the only
audio store).

Data access rule for anything you write from here: **user-scoped reads go through the
Neon Data API, privileged writes go through direct SQL over `DATABASE_URL`** — see
`AGENTS.md` → "Data access: Neon Data API vs direct SQL".

## Archived in this repo (`scripts/_archive/supabase/`)

| File | Disposition | Note |
|---|---|---|
| `update-supabase-auth.py` | archived | Updated GoTrue `/auth/v1/admin/settings`; GoTrue is gone, auth is Managed Better Auth now. |
| `test_update_supabase_auth.py` | archived | Unit checks for the archived GoTrue settings script above. |
| `qa-create-test-user.cjs` | archived | Created throwaway identities via the Supabase admin API; test users are now created through Managed Better Auth signup (see `scripts/data-api-isolation-check.py`). |
| `check-supabase-tables.py` | archived | Read-only Supabase REST table probe; superseded by `~/.hermes/scripts/neon-health-watchdog.py` plus `psql "$DATABASE_URL"`. |
| `provision-learn-v2-completion.js` | archived | One-shot Learn v2 completion backfill (t_f94e01d5) already applied against Supabase; history only, never re-run. |

## Rewritten instead of archived

| File | Change |
|---|---|
| `scripts/inspect-learn-catalog.py` | Now reads Neon over `DATABASE_URL` (`psql`) instead of Supabase PostgREST with the service-role key. Same output shape; read-only. |

## Archived outside the repo (`~/.hermes/scripts/_archive/supabase/`)

| File | Disposition | Note |
|---|---|---|
| `verify-adroit-supabase.sh` | archived | Checked the old project's REST health and management-API status. |
| `supabase-quota-watchdog.py` | archived | Cron job `8dea265ed197` now runs `neon-health-watchdog.py` instead (same job id, same 6-hour schedule, no cron deleted). |

## Unchanged on purpose

| File | Why |
|---|---|
| `scripts/apply-tag-vocab.js` | Content-only frontmatter rewrite; it never touched Supabase (listed for review, verified clean). |
| `~/.hermes/scripts/add-course.py` | Rewritten, not archived: `public.courses` INSERT now goes over `DATABASE_URL` with a mandatory `neon data-api refresh-schema` and a Data API read-back (`--db-register` / `--db-verify` / `--db-unregister`). |

## Deliberately still Supabase — different projects, not the adroit stack

These match a `supabase.co` grep but have nothing to do with `zrggxfdyptiahskogwnn`
(the adroit project). Do not "migrate" them without being asked:

| File | Project | Why it stays |
|---|---|---|
| `~/.hermes/scripts/martha-feedback.py` | Martha (its own Supabase project, URL from env) | Martha meal-planner app backend; unrelated to adroit.io. |
| `~/.hermes/scripts/martha-feedback-to-journal.py` | Martha | Same as above. |
| `~/.hermes/scripts/martha-feedback-tojournal.py` | Martha | Same as above. |
| `~/.hermes/scripts/sync-fixtures.sh` | `wobudfnfnrntfnphawea` (Pitchside) | Pitchside sync edge function; unrelated to adroit.io. |
| `~/.hermes/scripts/pitchside-sql.sh` | `wobudfnfnrntfnphawea` (Pitchside) | Pitchside Management-API SQL helper; unrelated to adroit.io. |

Acceptance grep after this migration, excluding the archived paths and the Martha /
Pitchside files above:

```
grep -rn "supabase\.co\|@supabase" ~/.hermes/scripts scripts/ \
  --exclude-dir=_archive | grep -v -e martha-feedback -e sync-fixtures.sh -e pitchside-sql.sh
# → no matches
```

## New operational trap

`neon data-api refresh-schema` is **mandatory after any DDL**, and after catalog
INSERTs/UPDATEs that must be visible to the site. The Data API serves a cached schema;
without the refresh a brand-new course (or column) 404s even though the row exists.
The onboarding skills (`adroit-cert-course-onboarding`, `adroit-cert-course-pipeline`)
and `add-course.py` now bake this in.
