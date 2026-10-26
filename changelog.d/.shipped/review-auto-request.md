### PRs now explicitly request the owner as reviewer (process)

**What** - New `.github/workflows/pr-review-assign.yml` requests a review from `@tophersymps` on every
`opened` / `ready_for_review` / `reopened` pull request, skipping only PRs the owner authored themselves. It
never fails the run: a duplicate request or an unavailable reviewer logs and exits 0.

**Why** - `.github/CODEOWNERS` is on `main` and `codeowners/errors` returns `[]`, yet PRs #403 and #404 were
opened 1.5 hours AFTER it landed with no reviewer requested at all. An implicit review request that silently
does not fire is how work sits green-but-unreviewed while the board reports it done, which is the exact
failure that stranded three tickets on 2026-10-23. The explicit workflow makes the request deterministic and
visible in the PR checks.

**Verified** - Workflow YAML lints clean. The request action itself is exercised on this PR (see the
"Request owner review" check). Also confirmed `gh pr edit --add-reviewer tophersymps` works for the
backfill case, which was used to add the reviewer to #403 and #404.

**Known Issues** - This is a fallback for an unexplained GitHub behaviour, not a root-cause fix. Turning on
the ruleset's "Require review from Code Owners" (owner-only) would additionally make the approval a hard merge
blocker rather than only a request.
