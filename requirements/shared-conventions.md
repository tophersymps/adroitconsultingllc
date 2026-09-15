# Adroit Blog — Account & Learn Round 3: Shared Conventions

**Date:** 2026-08-11
**Author:** Lois Lane (BA)
**Project:** Adroit Blog (tenant: adroit-blog)
**Repo:** ~/Documents/Fortress-of-Solitude/adroit-blog

## 1. Purpose

This document defines the shared conventions, cross-cutting requirements, and constraints that apply to all six workstreams in Round 3. All downstream architects and implementers should reference this file before designing or coding any feature.

## 2. Locked Decisions (Chris, 2026-08-11)

| # | Decision |
|---|----------|
| 1 | **Spacing audit scope:** Whole site. Kara delivers findings + fixed design tokens; steel implements. |
| 2 | **Dark mode:** Auto (follows OS `prefers-color-scheme`) + manual toggle override. Persisted per-account in `user_profiles.theme_pref`. Toggle in Settings AND avatar menu. |
| 3 | **Guest gating:** Syllabus pages stay readable (SEO/guest preview). Learn hub cards non-clickable for guests with sign-in CTA. Interactive tiers (quiz/check/exam/cert) stay gated as today. |
| 4 | **Course taxonomy:** Hierarchical per industry standard. `group` (top-level track) exists on LearningSeries; add optional `subgroup` as content metadata in `src/data/learn.ts` + `series.json`. NO DB migration for taxonomy. |
| 5 | **Avatar menu header:** Shows display name. Profile gets name fields + separate username field. |

## 3. Tech Stack (existing)

- **Framework:** Next.js 16 + Tailwind CSS 4
- **Database:** Supabase (PostgreSQL + Auth)
- **Auth:** HttpOnly cookie-based (server-side session check)
- **Content:** MDX files under `content/learn/`, auto-generated to `src/data/learn.ts` via `scripts/build-learn.js`
- **Existing progress tables:** `read_progress`, `lesson_completion`, `quiz_attempt` (with RLS)

## 4. Shared Conventions

### 4.1 Auth Pattern
- All server components use `getSupabaseServerClient()` to read the HttpOnly cookie
- Guests are redirected to `/login?next=<current-path>` (server-side, no client auth flash)
- New profile API endpoints must follow the existing `/api/auth/*` pattern with server-side session checks
- Do NOT rely on client-side RLS for writes — enforce on the server

### 4.2 Auth User Interface (existing)
```typescript
interface AuthUser {
  id: string;
  email: string;
}
```
New fields (display_name, username) will come from the `user_profiles` table, not auth.users.

### 4.3 Guest CTA Pattern
- Reuse existing `GuestCTA` component copy pattern
- For Learn hub cards: non-clickable for guests, show "Sign in to access courses" CTA
- Syllabus pages (`/learn/[series]/[lesson]`) remain fully readable — only interactive tiers are gated

### 4.4 Content Data Model
- `LearningSeries` type in `src/data/types.ts` — existing fields: `slug`, `name`, `description`, `group?`, `gradient`, `lessons[]`, `totalLessons`
- New field: `subgroup?: string` (optional, content metadata only)
- Content lives in `content/learn/<series>/series.json` and MDX files — regenerated via `npm run prebuild`
- No DB changes for taxonomy — it is file-based content metadata

### 4.5 Progress Tracking (existing)
- `read_progress` table: tracks blog/lesson reads (user_id, content_type, content_slug, read_at)
- `lesson_completion` table: tracks lesson completion (user_id, lesson_slug, completed_at)
- `quiz_attempt` table: tracks quiz answers (user_id, quiz_name, question_index, etc.)
- All tables have RLS policies: users can only access their own data

### 4.6 Design Tokens
- Navy/red/gray design token system (Tailwind CSS variables)
- Card styling: `rounded-2xl`, `border border-gray-200`, `shadow-card`
- Section headers: `font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em]`
- Spacing inconsistencies are a known issue (WS-1 audit scope)

### 4.7 Dark Mode Requirements
- Full-site theme via CSS variables + `dark` class on `<html>`
- Must apply to: blog posts, MDX lesson content, all UI components
- Default: `system` (follows OS `prefers-color-scheme`)
- Manual override persisted in `user_profiles.theme_pref` (values: `system` | `light` | `dark`)
- Toggle surfaced in Settings page AND avatar menu dropdown

### 4.8 Accessibility
- All interactive elements must maintain keyboard navigation (existing WAI-ARIA patterns in AvatarMenu)
- Dark mode must pass a11y contrast checks (lara's a11y audit is essential)
- Guest gating must not break screen reader navigation

## 5. Cross-Cutting Constraints

### 5.1 SEO
- Syllabus pages must remain crawlable by search engines
- Guest users can read syllabus content — only interactive elements are gated
- Course card content (name, description) renders server-side for all users

### 5.2 Performance
- Dark mode token changes should not cause layout shifts
- Progress data fetching should be efficient (batch queries where possible)

### 5.3 Security
- Profile API must enforce server-side session checks (HttpOnly cookie)
- No client-side RLS reliance for writes
- Guest gating is UI-level only — syllabus content is public

## 6. Out of Scope (this round)

- Email updates subscription functionality (kept as COMING SOON teaser)
- Password reset / change-password API
- Community/social features (username stored now, feature later)
- New course content creation

## 7. Workstream Dependencies

```
WS-1 (Spacing audit)  →  Design (Kara) → Build (steel)
WS-2 (Account defaults) → DB migration → API → UI (Settings + AvatarMenu)
WS-3 (Learn tab)       →  Content data changes → UI (Learn hub + PathCard)
WS-4 (Continue learning) → Depends on WS-2 auth + existing progress tables
WS-5 (Profile identity)  → Depends on WS-2 user_profiles table
WS-6 (Settings)         →  No functional change (teaser only)
```

## 8. Testing Considerations

- Auth gating: verify guest vs logged-in behavior on Learn hub and syllabus pages
- Dark mode: verify all routes render correctly in both themes
- Taxonomy: verify filter chips and subgroup headers display correctly
- Continue learning: verify correctness of "in-progress" calculation (>=1 completed, < total)
- Profile: verify name fields persist and display in avatar menu
- Cross-feature: verify dark mode works with all new components
