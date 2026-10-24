# Migration delta verification — Supabase vs Neon (R1-6)

**Verified:** 2026-10-23 11:33 EDT (15:33Z), task `t_ccbfa3d3`
**Supabase project:** `zrggxfdyptiahskogwnn` (`public` schema, read via Management API SQL)
**Neon project:** `dawn-darkness-89797362`, branch `production`, database `neondb`
**Verdict:** **14/14 tables MATCH. Zero drift.** `auth.users` (8) == Neon `public.user` (8), email sets identical.
This check is safe to re-run after cutover; commands are in §5.

---

## 1. Method

Per-table content fingerprint, computed independently on both sides with the *same* SQL:

```sql
select count(*)::int,
       md5(coalesce(string_agg(t::text, '' order by t::text), ''))
from public.<table> t;
```

Running on both sides with `timezone='UTC'`, `datestyle='ISO, MDY'`, `extra_float_digits=3` makes the
row `::text` renderings comparable, so an equal md5 over equal counts means the **row contents** are
byte-identical, not merely the row counts.

- **Neon** — direct `psql "$DATABASE_URL_UNPOOLED"` against the production branch.
- **Supabase** — PostgREST is dead (`HTTP 402 exceed_storage_size_quota`), so SQL was executed through
  the Management API (`POST https://api.supabase.com/v1/projects/<ref>/database/query`). That endpoint
  is read-only in effect here: the project is over its storage quota and rejects writes.

## 2. Result — 14/14 MATCH

Counts and `md5(string_agg(row::text ORDER BY row::text))` per table. Full pasted output of the
comparison program is in §2.1.

| Table | Supabase rows | Supabase md5 | Neon rows | Neon md5 | Status |
|---|---:|---|---:|---|---|
| admin_audit_log | 82 | `1912a697ebc3fcdf3e96b10a05fc0dbd` | 82 | `1912a697ebc3fcdf3e96b10a05fc0dbd` | **MATCH** |
| catalog_groups | 2 | `760ea16d825718caca2653e6c0c2cc64` | 2 | `760ea16d825718caca2653e6c0c2cc64` | **MATCH** |
| catalog_sections | 3 | `3361edb27ec0042a48fd8f47a647bfae` | 3 | `3361edb27ec0042a48fd8f47a647bfae` | **MATCH** |
| completion_events | 0 | `d41d8cd98f00b204e9800998ecf8427e` | 0 | `d41d8cd98f00b204e9800998ecf8427e` | **MATCH** |
| course_prerequisites | 2 | `6e57171a690b1ac959c1b7eb6a7b5aa1` | 2 | `6e57171a690b1ac959c1b7eb6a7b5aa1` | **MATCH** |
| courses | 12 | `b8b542321bed8890f751ce950ee56943` | 12 | `b8b542321bed8890f751ce950ee56943` | **MATCH** |
| lesson_completion | 13 | `c7d3a6a72d7422ddab15302cdb4a3c72` | 13 | `c7d3a6a72d7422ddab15302cdb4a3c72` | **MATCH** |
| quiz_attempt | 54 | `a7d1db0270fd50e1e70266b538f09dbd` | 54 | `a7d1db0270fd50e1e70266b538f09dbd` | **MATCH** |
| quiz_run | 11 | `1aeb33cc7aa272bbbe3081daf5f53c81` | 11 | `1aeb33cc7aa272bbbe3081daf5f53c81` | **MATCH** |
| read_progress | 6 | `f357c2051c577b7ab060bb074626af50` | 6 | `f357c2051c577b7ab060bb074626af50` | **MATCH** |
| subscriptions | 0 | `d41d8cd98f00b204e9800998ecf8427e` | 0 | `d41d8cd98f00b204e9800998ecf8427e` | **MATCH** |
| user_entitlements | 38 | `2e7db04c9cac040da9c55ef156868f5e` | 38 | `2e7db04c9cac040da9c55ef156868f5e` | **MATCH** |
| user_profiles | 7 | `f09174c293664b4fea3aa5ab8bc996ed` | 7 | `f09174c293664b4fea3aa5ab8bc996ed` | **MATCH** |
| user_roles | 4 | `e94c832f92620bb2c95eb14964386777` | 4 | `e94c832f92620bb2c95eb14964386777` | **MATCH** |

`d41d8cd9…` is the md5 of the empty string: both zero-row tables hash as empty, which is correct.

### 2.1 Raw comparison output

```
admin_audit_log|82|1912a697ebc3fcdf3e96b10a05fc0dbd|82|1912a697ebc3fcdf3e96b10a05fc0dbd|MATCH
catalog_groups|2|760ea16d825718caca2653e6c0c2cc64|2|760ea16d825718caca2653e6c0c2cc64|MATCH
catalog_sections|3|3361edb27ec0042a48fd8f47a647bfae|3|3361edb27ec0042a48fd8f47a647bfae|MATCH
completion_events|0|d41d8cd98f00b204e9800998ecf8427e|0|d41d8cd98f00b204e9800998ecf8427e|MATCH
course_prerequisites|2|6e57171a690b1ac959c1b7eb6a7b5aa1|2|6e57171a690b1ac959c1b7eb6a7b5aa1|MATCH
courses|12|b8b542321bed8890f751ce950ee56943|12|b8b542321bed8890f751ce950ee56943|MATCH
lesson_completion|13|c7d3a6a72d7422ddab15302cdb4a3c72|13|c7d3a6a72d7422ddab15302cdb4a3c72|MATCH
quiz_attempt|54|a7d1db0270fd50e1e70266b538f09dbd|54|a7d1db0270fd50e1e70266b538f09dbd|MATCH
quiz_run|11|1aeb33cc7aa272bbbe3081daf5f53c81|11|1aeb33cc7aa272bbbe3081daf5f53c81|MATCH
read_progress|6|f357c2051c577b7ab060bb074626af50|6|f357c2051c577b7ab060bb074626af50|MATCH
subscriptions|0|d41d8cd98f00b204e9800998ecf8427e|0|d41d8cd98f00b204e9800998ecf8427e|MATCH
user_entitlements|38|2e7db04c9cac040da9c55ef156868f5e|38|2e7db04c9cac040da9c55ef156868f5e|MATCH
user_profiles|7|f09174c293664b4fea3aa5ab8bc996ed|7|f09174c293664b4fea3aa5ab8bc996ed|MATCH
user_roles|4|e94c832f92620bb2c95eb14964386777|4|e94c832f92620bb2c95eb14964386777|MATCH

MATCH 14/14
supabase auth.users rows=8 neon public.user rows=8
email sets equal: True
missing in neon: []
extra in neon: []
```

Table set was enumerated on both sides before hashing, so a table that existed on one side only would
have shown up as `MISSING`. Both sides return exactly the same 14 `public` base tables.

## 3. Identity / auth users

| Check | Result |
|---|---|
| `auth.users` (Supabase) count | **8** |
| `public.user` (Neon) count | **8** |
| Email set equality (case/order-insensitive) | **equal** — 0 missing, 0 extra |
| `auth.users.email_confirmed_at` non-null | 8/8 (already verified in the R1-1 snapshot, not re-queried here) |

Emails present in both (not sensitive beyond what the app already stores):
chris.sympson@gmail.com, juliannemsward@gmail.com, kelex1812@gmail.com, natalie.sympson@gmail.com,
qa.admin@adroit.io, qa.granted@adroit.io, qa.member@adroit.io, sympson3w@hotmail.com.

`public.user` on Neon is Better Auth-shaped (`id, name, email, emailVerified, image, createdAt,
updatedAt`) and holds the 8 imported rows. Supabase has no `public.user` table at all, so this is an
**addition**, not a drift.

**Advisory for the cutover task (`t_3682070b`, pre-flight #3):** Managed Better Auth's own store,
`neon_auth.user`, currently holds **3 rows, all test probes** (`alpha-r12-probe@adroit.io`,
`kelex1812+qa-neon-r15-a@gmail.com`, `kelex1812+qa-neon-r15-b@gmail.com`). The 8 real users are in
`public.user`, not `neon_auth.user`. That is consistent with a first-sign-in / reset-password flow, but
it means "existing users will be asked to reset passwords" must be verified against the *sign-in path
actually reading `neon_auth.user`* — a smoke test with a real account, not a probe. Not drift; do not
treat this document as proof that those 8 accounts can sign in.

## 4. Repo freshness (before Release 2 code work)

Fetched `origin/main` fresh at verification time.

| | Value |
|---|---|
| Local clone (`/Users/kelex/Documents/Projects/adroit-code`) `HEAD` | `08b1e0042e081507ef34db81b71a50d32e881f3a` (2026-09-21) |
| `origin/main` | `7ba6dd82bdfff1b1730cf74fe279b42546075ccf` |
| Commits behind / ahead | **872 behind, 0 ahead** |
| `content/learn` files at local HEAD | **654** |
| `content/learn` files at `origin/main` | **1123** |
| Working tree | dirty — 10+ entries, including the untracked migration artifacts `neon.ts`, `docs/ROLLBACK-auth-migration.md`, `supabase/migrations/neon_schema.sql` |

**STALE — flagged, not fixed.** The clone is not a usable base for Release 2 code work. It is also
dirty with uncommitted migration work, so resetting it in place would destroy that work. Recommended
fix (for the Release 2 owner, not done here): work from a fresh `git worktree add` / clone of
`origin/main` rather than resetting the shared directory.

`origin/main` tip `7ba6dd82` is also the commit of the recorded pre-migration production deployment
(`dpl_6S5sEBX3iB3FvAHES27a4vSUA9h8`) in `docs/ROLLBACK-auth-migration.md` §4.1, so the repo tip and
production agree as of this check.

## 5. How to re-run this immediately before and after cutover

No secrets belong in this file; read them from BWS / the env at run time.

```bash
# 0) Table set must be identical on both sides (expected: the same 14)
#    Supabase: select table_name from information_schema.tables
#              where table_schema='public' and table_type='BASE TABLE' order by 1

# 1) Neon fingerprint (needs DATABASE_URL_UNPOOLED from .env.local)
cd /path/to/adroit-code && set -a && . ./.env.local && set +a
psql "$DATABASE_URL_UNPOOLED" -At -F '|' -f scripts/migration-delta-fingerprint.sql > neon_fp.txt

# 2) Supabase fingerprint — Management API, because PostgREST is 402
export SUPABASE_ACCESS_TOKEN=$(tr -d '\n' < ~/.supabase/access-token)
jq -Rs '{query:.}' < scripts/migration-delta-fingerprint.sql > payload.json
curl -s -X POST "https://api.supabase.com/v1/projects/zrggxfdyptiahskogwnn/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @payload.json > supabase_fp.json

# 3) Users
curl -s -X POST ".../database/query" -d '{"query":"select email from auth.users order by 1"}'
psql "$DATABASE_URL_UNPOOLED" -At -c "select email from public.user order by 1"

# 4) Compare: counts AND md5 must be equal per table. Any DRIFT line = stop.
```

The query file is committed next to this doc as `scripts/migration-delta-fingerprint.sql` — the 14
`UNION ALL` fingerprint selects with `set timezone / datestyle / extra_float_digits` at the top. Any
`DRIFT` line, or a table present on one side but not the other, is a stop signal.

**Drift protocol:** any table showing `DRIFT` (count or md5 inequality) means the migration did not
carry every row. Stop, do not promote cutover, report the table with both hashes and restore from the
row-level CSVs in `~/Documents/Archives/adroit-auth-snapshot-2026-10-22/` (FK-safe order in
`docs/ROLLBACK-auth-migration.md` §2 Tier 4).

## 6. Why no drift is expected even now

Daily Planet publishing since 2026-10-17 writes MDX + `learn.ts` into the repo, never the database,
and Supabase has been 402-restricted since 2026-10-13, so no write could have landed there. That
explains the result; it does not replace it — with Supabase frozen, this fingerprint stays valid until
cutover, which is why the same check must be re-run at cutover to prove nothing was written to Neon
that Supabase never had.
