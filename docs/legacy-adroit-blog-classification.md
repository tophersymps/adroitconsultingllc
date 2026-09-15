# Legacy 'adroit-blog' sweep and classification (card t_a633091b)

Scope: every case-insensitive occurrence of `adroit-blog` in the tracked files of
`tophersymps/adroitconsultingllc`, on branch `fix/legacy-adroit-blog-docs-t_a633091b`
(base `origin/main` at the time of the sweep).

Method: a script walks every tracked file, counts occurrences, and rewrites the tree with
git. Nothing historical was rewritten: `design/**`, `discovery/**`, `requirements/**` and
the `docs/**` implementation and architecture records are unchanged, and not one
pre-existing occurrence in `CHANGELOG.md` was edited (this card only appends a new entry to
it, and that entry quotes the string 10 more times).

## Counts

| scope | before (base) | after (this commit) |
|---|---|---|
| tracked occurrences | 251 | 216 |
| tracked files | 130 | 111 |
| occurrences removed by this card | | 45 in 20 files |
| occurrences added by this card | | 10 in 1 file (`CHANGELOG.md`, this card's own entry) |

The 216 occurrences in the tree at this commit are the 206 carried over from the sweep plus
the 10 quoted by this card's own `CHANGELOG.md` entry. The classification below covers the
206 carried-over occurrences; the 10 new ones are the changelog entry for this card, need
no verdict, and are excluded from the 206 figure on purpose.

This document is the one file in the repo that quotes the string by necessity (it is the
classification), so it is excluded from all of the counts above. To reproduce the file
counts: `grep -ril adroit-blog --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next .`
then drop `docs/legacy-adroit-blog-classification.md` from the list (it yields 130 files at
the base commit and 111 at this one). For the occurrence totals, add `-o` and count lines:
`grep -roi adroit-blog --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next . | wc -l`
with the same one-file exclusion — 251 occurrences before this card, 216 at this commit.
`git grep -I -i -o -e adroit-blog <rev>` against the two recorded revisions gives the same
totals.

Every one of the 251 occurrences that predate this card is accounted for: 45 removed by this
card plus 206 kept (31 code identifiers, 137 historical records, 38 dead artifacts), and the
10 added by this card's own `CHANGELOG.md` entry bring the tree to 216.

## 1. live-doc, fixed (45 occurrences, 20 files)

| occ | file | verdict |
|---|---|---|
| 23 | `README.md` | live-doc: fixed. AC-1 + AC-2: production URL and Vercel project, wiki links, Field Notes / The Atlas naming |
| 1 | `content/blog/structured-output-tool-calling-reliability-2026.mdx` | live-doc: fixed. endnote label adroit-blog. -> adroit.io. |
| 1 | `content/learn/agentic-ai/choosing-models-providers-routing-fallbacks.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 2 | `content/learn/agentic-ai/cost-control-caching-model-tiers-budget-caps-spend-dashboards.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/enterprise-deployment-serving-api-design-rate-limits-quotas.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/evaluation-evals-golden-datasets-llm-as-judge.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/function-calling-parity-across-providers.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/guardrails-prompt-injection-system-boundaries-input-validation.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/human-in-the-loop-approvals-interrupts-escalation-kill-switches.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/observability-at-scale-metrics-alerts-slos.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/observability-tracing-logging-langsmith-opentelemetry-replay.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/structured-output-json-mode-function-calling-tool-schemas.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `content/learn/agentic-ai/tool-design-schemas-error-handling-retries.mdx` | live-doc: fixed. published lesson endnote citation repointed from the retired repo to tophersymps/adroitconsultingllc |
| 1 | `docs/daily-planet-constellation-runbook.md` | live-doc: fixed. runbook cd path pointed at the deleted pre-merger checkout |
| 2 | `package-lock.json` | live-doc: fixed. lockfile root name follows package.json |
| 1 | `package.json` | live-doc: fixed. npm package name renamed to adroitconsultingllc |
| 1 | `scripts/build-learn.js` | live-doc: fixed. B-04 build error message no longer prefixes the design doc with the dead project name |
| 1 | `src/lib/api-security.ts` | live-doc: fixed. stale comment replaced (prose only, allowlist values unchanged) |
| 2 | `supabase/config.toml` | live-doc: fixed. local project_id renamed; retired origin dropped from the auth redirect allowlist |
| 1 | `vitest.config.mts` | live-doc: fixed. config header comment names the live repo |

## 2. code identifiers kept (31 occurrences, 16 files)

Verdict: not documentation. These are functional keys (`adroit-blog:read:<slug>`,
`adroit-blog:lesson:<slug>`, `adroit-blog:quiz:<name>`, the `adroit-blog:progress-changed`,
`adroit-blog:auth-changed` and `adroit-blog:profile-changed` events, the Supabase sync keys)
plus the CSRF allowlist values for the retired origins. Renaming a storage key silently
strands every reader's saved progress, and the allowlist change is a behavior change with
its own tests, so both are left alone here and listed as follow-ups.

| occ | file | verdict |
|---|---|---|
| 2 | `src/app/api/profile/route.test.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 2 | `src/components/Constellations/ConstellationCelebration.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/components/Profile/ProfileForm.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/components/Progress/LessonCompleteProgress.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/components/Progress/MarkComplete.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/components/Progress/QuizStats.test.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/components/Progress/QuizWidget.test.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 3 | `src/lib/api-security.test.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 2 | `src/lib/api-security.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/lib/hooks/useAuth.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 2 | `src/lib/hooks/useLessonProgress.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/lib/hooks/useQuizProgress.test.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 2 | `src/lib/hooks/useQuizProgress.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 1 | `src/lib/hooks/useReadProgress.test.tsx` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 2 | `src/lib/hooks/useReadProgress.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |
| 8 | `src/lib/progress.ts` | runtime identifier (localStorage key or custom event namespace) or CSRF allowlist value; changing it would orphan stored reader progress or a shipped test |

## 3. legacy-doc, kept verbatim (137 occurrences carried over, 65 files)

Verdict: historical record of a past decision (design briefs, discovery notes, requirement
and architecture records, dated release notes). AC-5 requires these to be preserved, and a
sweep that edits them would be rewriting history rather than cleaning up current-facing
docs.

The 137 below are the pre-existing occurrences. `CHANGELOG.md` sits at 30 occurrences in the
tree at this commit: its 20 historical ones plus the 10 quoted by this card's own entry.

| occ | file | verdict |
|---|---|---|
| 20 | `CHANGELOG.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim. The 20 pre-existing occurrences are untouched — the file reads 30 at this commit only because this card appends its own entry, which quotes the string 10 more times |
| 1 | `deliverables/dark-mode-token-spec.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/arch/admin-experience-arch.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/architecture-content.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `design/copy-deck-quiz-tiers.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/design-direction.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/design-system-course-catalog-admin.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief-avatar-profile-settings.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief-course-catalog-admin.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief-darkmode-refresh.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief-draft-preview.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief-quiz-tiers.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/discovery/direction-brief.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/hubble-field/direction-brief.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `design/implementation-plan.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/round3/spacing-audit-round3.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/t_3a759160/direction-brief-immersive-3d.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/t_498437c7/direction-brief-constellations.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/t_65e26fdd/component-specs-constellations.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/t_ea789325/direction-brief-sky-roads.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/t_ea789325/reports/design-system.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/v4/design-brief-admin-v4.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/v4/shots/capture.js` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/v4/shots/capture.py` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/v4/shots/verify_report.js` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `design/verify_deliverables.py` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `discovery/brainiac-discovery.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 5 | `discovery/brainiac-discovery.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 6 | `discovery/consolidated-backlog.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 4 | `discovery/consolidated-backlog.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 5 | `discovery/kara-discovery.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 4 | `discovery/kara-discovery.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 4 | `discovery/lois-discovery.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 4 | `discovery/lois-discovery.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/arch-deep-sky-galaxy.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/arch-hubble-field.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/arch-hubble-field.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/arch-immersive-3d.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/architecture-content-quiz-tiers.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/design-immersive-3d-concept/concept-brief-immersive-3d.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/draft-state-architecture.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/hubble-field-north-star.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/hubble-field-north-star.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/immersive-3d-constellations-plan.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 3 | `docs/implementation-plan-avatar-profile.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/implementation-plan-hubble-field.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 5 | `docs/implementation-plan-progress.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/implementation-plan-quiz-tiers.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 3 | `docs/password-reset-architecture.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/requirements-hubble-field.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/requirements-hubble-field.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 3 | `docs/requirements-immersive-3d-constellations.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 3 | `docs/requirements-immersive-3d-constellations.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/requirements-quiz-tiers.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 4 | `docs/supabase-setup.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/system-architecture-admin-experience.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/system-architecture-constellations.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/system-architecture-course-catalog-admin.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `docs/system-architecture-learn-v2.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `docs/system-architecture.html` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `requirements-password-reset.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 3 | `requirements/course-catalog-entitlements-requirements.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `requirements/draft-state.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 1 | `requirements/feature-requirements.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |
| 2 | `requirements/shared-conventions.md` | historical design, discovery, requirements or release record of a past decision; AC-5 keeps these verbatim |

## 4. dead-artifact (38 occurrences, 30 files)

Verdict: leftover one-off tooling or output from the pre-merger project. Two flavours:

1. Scripts that hardcode `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`, a path
   that no longer exists on this machine (the pre-merger checkout was retired at cutover),
   or the retired Vercel project names `adroit-blog-deploy` / `adroit-blog.vercel.app`.
   They cannot run today.
2. The three `/blog` to `/field-notes` migration proofs (`scripts/rewrite-content-paths.js`,
   `scripts/verify-content-diff.js`, `scripts/verify-content-paths.js`). They reference the
   retired host as the source pattern of a completed migration.

Action taken: none beyond this classification. They are left in place on purpose:
removal is a destructive change that no acceptance criterion on this card requires, none of
them is reachable from `package.json` or from the audio backup list, and two of them were
security-hardened hours before this card was written. Follow-ups are listed in section 6.

| occ | file | verdict |
|---|---|---|
| 1 | `adroit-blog-design.html` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `adroit-blog-writer.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `docs/_decomposition-comment.txt` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `docs/_make_decomp.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/add-domain-via-api.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/audit-omni-content-quality.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/backfill-omni-learn.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/check-dns.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/check-supabase-tables.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/configure-dns.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/convert-citations.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/generate-omni-content.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/generate-omni-quizzes.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/inspect-learn-catalog.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-bundle-audit.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 2 | `scripts/perf-chunk-audit.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-chunk-audit2.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-chunk-audit3.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-chunk-audit4.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-chunk-audit5.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-chunk-audit6.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/perf-three-size.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/pick-topic.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 6 | `scripts/rewrite-content-paths.js` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/test_update_supabase_auth.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/update-supabase-auth.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/validate-omni-bar.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 2 | `scripts/verify-content-diff.js` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 2 | `scripts/verify-content-paths.js` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |
| 1 | `scripts/verify_contrast.py` | one-off script or output from the pre-merger project (dead absolute path or retired Vercel project name); kept in place, see follow-ups |

## 5. Untracked scratch in the shared clone (excluded)

`/Users/kelex/.hermes/kanban/workspaces/adroit-site-copy` (the shared checkout) holds
136 untracked files with 261 occurrences. Most are a whole
second checkout of the repo copied there by an earlier review lane (`valel-merge-check/`,
74 files), plus worker scratch (`human-digest-*.md`, `docs/_assistant/`, `scripts/tmp_*`).
They are not part of the repository, are not shipped by the build, and are not edited here.
The branch worktree used for this card has zero untracked matches.

## 6. Follow-ups recommended (not done here)

1. Remove the two retired origins from `ALLOWED_ORIGINS` in `src/lib/api-security.ts` and
   update `src/lib/api-security.test.ts` and `src/app/api/profile/route.test.ts` together.
2. Decide whether the `adroit-blog:` localStorage namespace is worth a one-time migration
   to `adroit:`; without a migration it must stay.
3. Delete or archive the dead artifacts in section 4 (they are broken one-offs) in one
   dedicated cleanup card with a diff that is reviewable on its own.
4. Rename the root `adroit-blog-writer.py` only together with whatever still invokes it by
   name (the Weekly content cron history references an `adroit-blog-writer` job name).
5. Naming debt outside the `adroit-blog` string: `docs/course-progression-pattern.md`,
   `requirements/feature-requirements.md`, `requirements/report-content.md`,
   `requirements/shared-conventions.md`, `src/lib/learn.ts` and `scripts/backfill-omni-learn.py`
   still say "Learn tab" where the live UI says "The Atlas". Reported, not changed.

Generated by the sweep script on card t_a633091b.
