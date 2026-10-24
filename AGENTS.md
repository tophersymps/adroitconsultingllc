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
