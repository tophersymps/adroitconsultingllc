<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:data-access-rules -->

# Data access: Neon Data API vs direct SQL (hybrid rule)

Supabase is decommissioned (2026-10-23). Data lives in Neon Postgres. There are two
access paths and picking the wrong one is a security bug, not a style choice.

1. **User-scoped reads and any request made on behalf of a signed-in (or guest)
   user → Neon Data API.** PostgREST-compatible REST at `NEON_DATA_API_URL`, called
   with the request's Better Auth JWT. RLS is the only authorization layer on this
   path, so every row it returns must be gated by a policy. Never read user data
   with direct SQL in a request path and hand-filter it.

2. **Privileged writes and server-only jobs (admin writes, quiz/completion,
   backfills, scripts, onboarding) → direct SQL over `DATABASE_URL`** as the
   dedicated non-superuser role. These bypass RLS by design, so they must scope
   their own `WHERE` clauses explicitly.

Rules that follow from this:

- After **any DDL, or an INSERT/UPDATE of catalog metadata that must be visible to
  the site, run `neon data-api refresh-schema`** (project `dawn-darkness-89797362`,
  branch `production`, db `neondb`). The Data API serves a cached schema; skip the
  refresh and the new table/column/row 404s even though it exists. This is the #1
  operational trap of the Neon stack.
- A direct-SQL write is not "done" until it is read back through the Data API.
  `~/.hermes/scripts/add-course.py --db-verify` does exactly that for courses.
- Never connect the Data API as `postgres` or any BYPASSRLS role, and never add a
  table to `public` without policies if the Data API lists that schema.
- `AUDIO_DUAL_WRITE_SUPABASE` stays `false` in `adroit-site-copy/.env.local` — R2 is
  the only audio store.

<!-- END:data-access-rules -->
