# Draft-State Requirements: Blog + Learn Content

**Date:** 2026-08-13
**Author:** Lois Lane (BA)
**Project:** Adroit Blog (tenant: adroit-blog)
**Version:** v1.0
**Parent task:** t_d9c1e3d3

## Executive Summary

Chris's editorial model requires content authors (Jimmy) to push blog articles and learn lessons to the repo WITHOUT those items being visible to the public until Perry's review completes. The mechanism: a `status: draft|published` frontmatter field on every MDX post/lesson. The public build filters out drafts entirely. An auth-gated preview route lets authorized editors view drafts at request time. The "flip" from draft to published is a commit that changes the field, triggered by Perry's review cron on PASS.

This feature touches two content pipelines (blog and learn), two build scripts, the sitemap, the RSS feed, and introduces a new preview route with auth gating.

## Status Field Contract

- **Field name:** `status`
- **Allowed values:** `draft` | `published`
- **Location:** MDX frontmatter (YAML block between `---` delimiters)
- **Default when absent:** `published` (backward compatibility — 30+ existing lessons and all existing blog posts must NOT be treated as drafts)
- **Scope:** Applies to both `content/blog/*.mdx` AND `content/learn/<series>/*.mdx`
- **Type definitions:**
  - `BlogPost` interface in `src/data/types.ts`: add `status?: "draft" | "published"` (optional, defaults to `"published"`)
  - `LearnLesson` interface in `src/data/types.ts`: add `status?: "draft" | "published"` (optional, defaults to `"published"`)

## Build Filtering

Both build scripts (`scripts/build-posts.js` and `scripts/build-learn.js`) must skip entries where `status: draft` in the generated TypeScript data files. Drafts must NOT appear in:

| Public surface | Current data source | Filtering point |
|---|---|---|
| `/blog` listing page | `src/data/posts.ts` | `build-posts.js` output array |
| `/blog/categories` page | `src/data/posts.ts` | `build-posts.js` output array |
| `/blog/[slug]` individual post | `generateStaticParams()` filters against `posts` array | Already excluded if not in posts.ts |
| `/learn` hub page | `src/data/learn.ts` (`learnSeries`, `learnLessons`) | `build-learn.js` output arrays |
| `/learn/[series]` series syllabus | `src/data/learn.ts` (`learnSeries[].lessons`) | `build-learn.js` output arrays |
| `/learn/[series]/[slug]` individual lesson | `generateStaticParams()` filters against `learnLessons` | Already excluded if not in learn.ts |
| `sitemap.ts` (SEO) | imports `posts`, `learnLessons`, `learnSeries` | Already excluded if not in generated data |
| `feed.ts` (RSS) | imports `posts` | Already excluded if not in generated data |
| Tag pages / tag counts | derived from `posts` array | Already excluded if not in generated data |
| Featured post logic | derived from `posts` array | Already excluded if not in generated data |

**Key insight:** Filtering at the build scripts is the single source of truth. Every downstream consumer (pages, sitemap, feed, tags) reads from the generated `posts.ts` / `learn.ts`. If drafts are excluded there, they are excluded everywhere.

## Preview Route Specification

- **Purpose:** Render a draft MDX for authorized viewers only.
- **Route pattern:** `/preview/[kind]/[slug]` where `kind` is `blog` or `learn`.
  - For blog: `/preview/blog/[slug]` reads `content/blog/[slug].mdx`
  - For learn: `/preview/learn/[series]/[slug]` reads `content/learn/[series]/[slug].mdx`
- **Rendering:** Uses the same MDX renderer as public pages (`next-mdx-remote/rsc`, `remark-gfm`, `linkifySourceCitations`, `stripMDXFrontmatter`). The draft should look identical to the published version, with a "DRAFT" banner overlaid.
- **File access:** Must read `content/*.mdx` at request time (dynamic route). The repo files are deployed with the Vercel function — use `outputFileTracingIncludes` or a direct `fs.readFileSync` path from `process.cwd()`.
- **Draft banner:** A prominent "DRAFT - Not yet published" banner at the top of the article, visually distinct from published content.

## Auth Gate Design

- **Auth mechanism:** Existing Supabase SSR session (cookie-based, via `getSupabaseServerClient()`).
- **Allowlist:** An environment variable `PREVIEW_ALLOWED_EMAILS` containing a comma-separated list of email addresses (e.g., `chris@adroit.io,perry@adroit.io`).
- **Behavior:**
  - **Authenticated + allowlisted:** User sees the draft with the draft banner.
  - **Authenticated + NOT allowlisted:** User sees an access-denied message ("This content is not yet available").
  - **Unauthenticated (guest):** User is redirected to `/login?next=/preview/...` or sees a login prompt.
- **Security:** Guests must NEVER see draft content. The check is server-side (no client-side gating).

## Review-to-Publish Flow

- **Mechanism:** The flip from `draft` to `published` is a commit that changes the frontmatter field.
- **Actor:** Perry's review cron (Blog Editor / Learning Editor) flips the field on PASS.
- **No UI required:** The flip is an agent-side edit (file write + commit). No manual "Publish" button needed in the preview UI.
- **Preview page indication:** The preview page should show the current status (DRAFT badge) so the reviewer knows the content's state.
- **Integration contract with editorial crons (for documentation only, no cron changes in this task):**
  - Perry's cron reads the MDX frontmatter, sets `status: published`, writes the file, and pushes the commit.
  - The build script runs at build time (prebuild step), filtering out any remaining drafts.
  - Vercel auto-deploys on push, so published content goes live with the next deploy.

## Backward Compatibility Rule

- **Critical:** Existing content without a `status` field must be treated as `published`.
- This means the `status` field is optional in types and defaults to `"published"` in build logic.
- Do NOT flip 30+ existing lessons or existing blog posts to draft state.

## User Stories

### US-001: Public never sees drafts
**As a** site visitor (guest or logged-in user), **I want** draft content to be completely invisible on all public pages, **so that** unfinished work is never accidentally exposed.

- Acceptance Criteria:
  - Given a blog post has `status: draft` in its frontmatter, When the build runs, Then that post is excluded from `src/data/posts.ts`.
  - Given a learn lesson has `status: draft` in its frontmatter, When the build runs, Then that lesson is excluded from `src/data/learn.ts` (both `learnSeries[].lessons` and `learnLessons` flat array).
  - Given a draft is excluded from generated data, When I browse `/blog`, `/learn`, `/blog/categories`, tag pages, or the sitemap, Then I cannot find the draft content.
  - Given a draft is excluded from generated data, When I fetch `/feed.xml`, Then the draft does not appear in the RSS feed.
  - Given a draft blog post exists, When I navigate to `/blog/[draft-slug]`, Then I get a 404 (since `generateStaticParams` won't include it).
  - Given a draft learn lesson exists, When I navigate to `/learn/[series]/[draft-slug]`, Then I get a 404.

### US-002: Authorized editors preview drafts
**As an** authorized editor (Chris or allowlisted user), **I want** to view draft content via a preview route, **so that** I can review work before it is published.

- Acceptance Criteria:
  - Given I am logged in with an allowlisted email, When I visit `/preview/blog/[slug]` for a draft post, Then I see the rendered article with a "DRAFT" banner.
  - Given I am logged in with an allowlisted email, When I visit `/preview/learn/[series]/[slug]` for a draft lesson, Then I see the rendered lesson with a "DRAFT" banner.
  - Given I am viewing a draft preview, When I read the page, Then the content renders with the same MDX renderer as the public pages (same typography, same components, same citation linkification).
  - Given I am viewing a draft preview, When I look at the top of the page, Then I see a prominent "DRAFT - Not yet published" banner distinguishing it from published content.

### US-003: Draft-to-publish flip
**As an** editorial workflow (Perry's review cron), **I want** the status field to be the single control for visibility, **so that** flipping `draft` to `published` makes content appear on the next build.

- Acceptance Criteria:
  - Given a post has `status: draft`, When the frontmatter is changed to `status: published` and the commit is pushed, Then the next build includes it in `posts.ts` and it appears on public pages.
  - Given a lesson has `status: draft`, When the frontmatter is changed to `status: published` and the commit is pushed, Then the next build includes it in `learn.ts` and it appears on public pages.
  - No manual UI is required for the flip — the workflow is file edit + commit.

### US-004: Guests blocked from preview
**As a** guest visitor (unauthenticated), **I want** to be blocked from viewing draft content, **so that** unfinished work remains private.

- Acceptance Criteria:
  - Given I am not logged in, When I visit `/preview/blog/[slug]`, Then I am redirected to `/login` or see a login prompt — I do NOT see the draft content.
  - Given I am logged in but my email is NOT in the allowlist, When I visit `/preview/blog/[slug]`, Then I see an access-denied message — I do NOT see the draft content.
  - Given I am a guest, When I try to access a draft via its public URL (`/blog/[slug]`), Then I get a 404 (the draft was never built into the static params).

### US-005: Backward compatibility for existing content
**As a** maintainer of the blog repo, **I want** existing content without a `status` field to remain published, **so that** adding draft support does not break the 30+ existing lessons or blog posts.

- Acceptance Criteria:
  - Given an existing blog post has no `status` field in its frontmatter, When the build runs, Then the post is treated as `published` and included in `posts.ts`.
  - Given an existing learn lesson has no `status` field in its frontmatter, When the build runs, Then the lesson is treated as `published` and included in `learn.ts`.
  - Given the default is `published`, When I count the posts/lessons in generated data, Then the count matches the pre-feature count.

## Constraints

- Vercel serverless function model: preview route must trace content files for deployment (`outputFileTracingIncludes` or equivalent).
- Supabase auth already exists (SSR cookie, `/api/auth/login|logout|session`, `useAuth` hook) but has no role/admin concept yet. The allowlist approach avoids adding a roles table.
- Build scripts run at `prebuild` time (`node scripts/build-posts.js && node scripts/build-learn.js`). No runtime content API — the site is SSG.
- The preview route is the only dynamic surface; everything else remains static.
- No changes to editorial crons in this task — only document the contract.

## Dependencies

- Existing Supabase auth infrastructure (session cookie, server client).
- Existing MDX rendering pipeline (`lib/mdx.ts`, `lib/learn.ts` strip/linkify functions).
- Existing build scripts (`scripts/build-posts.js`, `scripts/build-learn.js`).
- Design discovery task `t_add78bba` (Kara) for preview UX direction — the preview banner, layout, and auth-gate visual should align with Kara's design brief.

## Scope

**In scope:**
- Status field in MDX frontmatter (blog + learn)
- Build filtering in both build scripts
- Preview route with auth gating and email allowlist
- Draft banner on preview pages
- Type definitions update (`BlogPost`, `LearnLesson`)
- Backward compatibility for existing content
- Requirements documentation

**Out of scope:**
- UI for flipping draft to published (agent-side commit only)
- Changes to Perry's editorial crons (contract documented only)
- Role-based access control system (email allowlist is sufficient)
- Draft listing/index page (direct preview links are sufficient for now)
- WYSIWYG editor or in-browser draft creation

## Open Questions for Chris

1. **Allowlist management:** Should `PREVIEW_ALLOWED_EMAILS` be an env var, or do you want a Supabase table for editor emails? Env var is simpler but requires a deploy to add/remove editors.
2. **Preview route pattern:** Is `/preview/[kind]/[slug]` acceptable, or do you prefer `/drafts/...` or another pattern?
3. **Draft listing:** Should there be a `/drafts` index page showing all pending drafts for editors, or is a direct link per draft sufficient?
4. **Learn preview path:** For learn lessons, the preview needs both series and slug (`/preview/learn/[series]/[slug]`). Confirm this is the right shape.
5. **Series metadata:** When a draft lesson is the only lesson in a new series, should the series page (`/learn/[series]`) still appear? Currently series are derived from directories, not from the lessons array — so an empty series would still render (graceful "coming soon" state). Confirm this is acceptable.

## Priority

**High** — This is a gating feature for the editorial workflow. Jimmy cannot push content safely until draft state exists.

## Handoff

**To:** Brainiac (web architect) for implementation design.
**Also:** Kara (design discovery `t_add78bba`) is working on preview UX direction in parallel.
