# Changelog fragments

Do not edit `CHANGELOG.md` in a pull request. Add a fragment file here instead.

## Why

`CHANGELOG.md` is a single shared append target. When every branch edits the top of the same
file, every branch conflicts with every other branch the moment `main` moves. On 2026-10-23 that
produced 50 resolution merges in one day, and one of those resolutions silently deleted a release
body (PR #361 dropped the R1-6 provisioning section, restored later by PR #367).

A fragment file has a **unique path per change**, so two branches can never conflict on it.

## How

Create `changelog.d/<ticket-id>.md` containing one entry, in the same shape the changelog already
uses:

```markdown
### Short title of the change (t_abc12345)

**What** - what changed, concretely.

**Why** - the problem it fixes, with evidence.

**Verified** - the commands run and their results.

**Known Issues** - anything deliberately left undone, or "None".
```

Rules:

- One fragment per change. The filename is the ticket id (`t_xxx`) or a short slug.
- Start the body with a `###` heading, exactly like a published entry.
- Write in English. No em-dashes. No fabricated claims or version numbers.

## Shipping a release

`node scripts/compose-changelog.js` merges fragments into `CHANGELOG.md` (newest first, directly
under the file header) and moves the consumed fragments to `changelog.d/.shipped/` so nothing is
lost and nothing is merged twice.

Run it when cutting a release, not on every merge. The script is idempotent: fragments already in
`.shipped/` are never re-applied.
