<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Changelog fragments (not CHANGELOG.md)

Do not edit `CHANGELOG.md` in a pull request. Add `changelog.d/<ticket-id>.md` instead.

`CHANGELOG.md` is a single shared append target: every branch editing the top of it conflicts with
every other branch as soon as `main` moves. On 2026-10-23 that caused 50 resolution merges in one
day, and one resolution silently deleted a release body (PR #361 dropped the R1-6 provisioning
section, restored later by PR #367). A fragment path is unique per change, so it cannot conflict.

`node scripts/compose-changelog.js` merges fragments into `CHANGELOG.md` at release time and moves
them to `changelog.d/.shipped/`. See `changelog.d/README.md` for the entry shape and rules.

## Every PR requests a review from @tophersymps

`main` requires one approving human review. Open a PR with the owner requested as reviewer every time
(`gh pr create --reviewer tophersymps`), and never leave a PR sitting green but unreviewed while reporting
the work as done. `.github/CODEOWNERS` requests it automatically on PR creation.

Work is not "done" until its commit is on `main` and deployed. Until then the honest state is
"awaiting review" or "awaiting merge".

## Development database: Neon branch `dev-admin-ux`, never `production`

All local development and testing runs against the Neon branch `dev-admin-ux`
(`br-silent-sunset-b7g7vvph`, project `dawn-darkness-89797362`), a copy-on-write fork of `production`.
Do not point `.env.local` at the `production` branch, and do not run migrations, QA-user scripts or
destructive admin actions against it from a dev machine.

- `.env.local` (gitignored) must have `NEON_BRANCH=dev-admin-ux` and the branch's `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_DATA_API_URL` and `NEXT_PUBLIC_NEON_DATA_API_URL`.
  Verify with `npx neonctl branches get dev-admin-ux --project-id dawn-darkness-89797362`.
- Migrations in `supabase/migrations/neon/` are applied to `dev-admin-ux` first and tested there. They go
  to `production` only at deploy time, after the PR is approved and merged.
- QA accounts: `node scripts/qa-create-test-user.cjs <label>` (and `--delete` afterwards) against the dev
  branch only. The dev branch holds a copy of real user rows and uses the production email sender, so never
  trigger password-reset or invite emails for real users from it.
- Refresh the branch from production when it drifts:
  `npx neonctl branches reset dev-admin-ux --parent --project-id dawn-darkness-89797362`. This discards
  dev-only data and migrations, so re-apply pending migrations and re-create QA users afterwards.
- `http://localhost:3000` is a trusted Neon Auth domain on the dev branch only.
