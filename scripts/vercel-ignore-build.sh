#!/usr/bin/env bash
# Vercel "Ignored Build Step".
#
# Exits 0 to SKIP a deployment, 1 to BUILD it (Vercel's convention).
#
# Two independent questions, in order:
#
# 1. Which refs build at all?
#    main and release/* always build. Any other branch builds only when its
#    commit message carries "[preview]" — preview branches are opt-in so the
#    free tier's 100-deployments-per-day budget is spent on production.
#
# 2. On main/release, does this commit change anything the site renders?
#    A commit that only touches non-rendered paths (changelog fragments,
#    CHANGELOG.md, docs/, design/, README, .github/) cannot change the built
#    output, so it is skipped.
#
# DELIBERATELY NOT SKIPPED: content/, public/, src/. Blog articles and lessons
# are MDX compiled at build time, public/ holds the diagrams/banners served from
# the deployment, and src/data carries the learn registry. Skipping any of those
# would publish nothing until the next code deploy.
set -u

ref="${VERCEL_GIT_COMMIT_REF:-}"
msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"

# No ref information: build (never skip on missing data).
[ -z "$ref" ] && exit 1

case "$ref" in
  main|release/*) ;;                                   # fall through to the path check
  *)
    case "$msg" in *"[preview]"*) exit 1 ;; esac       # opt-in preview build
    exit 0                                             # everything else: skip
    ;;
esac

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -z "$prev" ] && exit 1                               # no baseline: build

files="$(git diff --name-only "$prev" "${VERCEL_GIT_COMMIT_SHA:-HEAD}" 2>/dev/null)" || exit 1
[ -z "$files" ] && exit 1                              # diff unavailable: build

# Skip only when EVERY changed path is non-rendered.
if printf '%s\n' "$files" | grep -qvE '^(changelog\.d/|CHANGELOG\.md$|docs/|design/|README\.md$|\.github/)'; then
  exit 1                                               # something rendered changed: build
fi
exit 0
