# Adroit Blog — Account & Learn Round 3: System Architecture

**Author:** Brainiac (arch task t_cde0e74a)
**Parent requirements:** requirements/shared-conventions.md (t_33e1d4f6, Lois)
**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase (Postgres/Auth)
**Brand:** Adroit Consulting
**Pipeline handoff:** Kara (designer) → steel (implementation)

---

## 1. Route Table

| Route | Type | Auth | Purpose | New/Change |
|-------|------|------|---------|-----------|
| `/learn` | Server component | Public (guest-gated cards) | Learn hub: filters, groups, subgroups, continue-learning | **Change** (rework) |
| `/learn/[series]` | Server comp | Public (syllabus readable) | Series syllabus — stays fully readable for SEO/guests | Unchanged |
| `/learn/[series]/[slug]` | Server comp | Public (syllabus readable); interactive tiers gated | Lesson page — unchanged gating via existing GuestCTA | Unchanged |
| `/profile` | Server comp | Session-gated (redirect→/login) | Identity + name/username fields + My Certificates | **Change** (add form + certs) |
| `/settings` | Server comp | Session-gated | Appearance (theme toggle) + Reading progress + Email teaser | **Change** (add theme section) |
| `GET /api/profile` | Route handler | Session-check server-side | Read own profile (upsert row on first read) | **New** |
| `PATCH /api/profile` | Route handler | Session-check server-side | Update displayName / username / themePref | **New** |
| `GET /api/continue-learning` | Route handler | Session-check; guests get `[]` | In-progress series (≥1 completed, < total), most-recent-first | **New** |

Auth pattern: every gated route/API uses `getSupabaseServerClient()` (HttpOnly cookie). Guests are redirected server-side to `/login?next=<path>`. Writes enforced server-side only (no client RLS reliance) — follows existing `/api/auth/*` convention.

---

## 2. Component Hierarchy

```
app/
  layout.tsx                     → wraps <ThemeProvider> (new) around children
  learn/
    page.tsx (server)            → LearnFilters + ContinueLearning (if authed) + grouped PathCard grid
      Learn/PathCard.tsx         → [modify] guest-gate: non-clickable <div> + Sign-in CTA when guest; subgroup badge
      Learn/LearnFilters.tsx     → [new] client; top-level group chips + subgroup chips
      Learn/ContinueLearning.tsx → [new] client; resume cards, most-recent-first
      Progress/SeriesProgress.tsx→ [unchanged] progress bar on card body
      Progress/QuizStats.tsx     → [unchanged] quiz avg on card body
  profile/
    page.tsx (server)            → [modify] loads profile via GET /api/profile (or direct SSR); renders ProfileForm + CertificateSection
      Profile/ProfileForm.tsx    → [new] client; display_name + username inputs, save→PATCH
      Profile/CertificateSection.tsx → [new] server/client; My Certificates from certificate lib + tier progress
  settings/
    page.tsx (server)            → [modify] adds Appearance section w/ ThemeToggle
      Settings/ThemeToggle.tsx   → [new] client; System/Light/Dark segmented control → PATCH themePref
  components/
    Header.tsx                   → [modify] pass display_name to AvatarMenu; render ThemeToggle in avatar menu dropdown
    AvatarMenu.tsx               → [modify] show display_name (fallback email); add theme quick-toggle row
    Theme/ThemeProvider.tsx      → [new] client; resolves system/light/dark, toggles `dark` class on <html>
    Theme/useTheme.ts            → [new] hook; { mode, setMode, resolvedDark }
```

**Server/client split:** route pages are server components that render data + gate auth; interactive sub-parts (filters, forms, theme, continue-learning resume links) are small client components. No giant client bundle on Learn — filters and continue-learning are independent client islands; PathCards and grouping stay server-rendered for SEO.

---

## 3. Data & API Contracts

### 3.1 `user_profiles` migration (supabase/migrations/005_user_profiles.sql)
```sql
create table if not exists user_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username     text,
  theme_pref   text not null default 'system'
               check (theme_pref in ('system','light','dark')),
  updated_at   timestamptz not null default now()
);
alter table user_profiles enable row level security;
create policy "users select own profile"  on user_profiles for select using (auth.uid() = user_id);
create policy "users upsert own profile"  on user_profiles for insert with check (auth.uid() = user_id);
create policy "users update own profile"  on user_profiles for update using (auth.uid() = user_id);
```
- `user_id` is PK/FK → exactly one profile row per auth user.
- Read via `select().eq('user_id', user.id).maybeSingle()`; **upsert** on first access so `theme_pref` has a home before any user action.
- `username` is stored now (social-ready, out-of-scope for features this round), unique index deferred to when community ships.

### 3.2 API contracts (full TS in `src/shared/contracts-account.ts` — compiles)
- `GET /api/profile` → `{ user:{id,email}, profile:{userId,displayName,username,themePref} }`; upserts row on first read. 401→`{ user:null }` (mirrors /api/auth/session shape) — client decides.
- `PATCH /api/profile` body `{ displayName?, username?, themePref? }` → 200 `{ profile }`; server validates `themePref ∈ {system,light,dark}`; unknown user → 401.
- `GET /api/continue-learning` → `{ items: ContinueLearningItem[] }`; guests → `{ items: [] }`.
  - Item = series where `completedCount >= 1 AND completedCount < totalLessons`, `nextLessonSlug` = lowest-numbered uncompleted lesson (via getLessonsForSeries asc), `percent = round(completed/total*100)`, `lastCompletedAt` for desc sort.
  - Data from existing `lesson_completion` + `read_progress` (no new tables).

### 3.3 Course taxonomy (content metadata only — NO DB migration)
- `LearningSeries` gains `subgroup?: string` (src/data/types.ts).
- Populated from `content/learn/<series>/series.json` → `src/data/learn.ts` via `scripts/build-learn.js` regen (`npm run prebuild`).
- Existing `group` stays. Plan:
  - `agentic-ai`: no group (→ "Learning Paths")
  - `omni-studio-cert`: group "Salesforce Certifications", subgroup "Developer"
  - `salesforce-architect`: group "Salesforce Certifications", subgroup "Architect"
- Learn hub renders top-level group chips; selecting a group reveals subgroup chips; subgroup headers group the card grid.

### 3.4 Auth gating contract
| Surface | Guest | Signed-in |
|---------|-------|-----------|
| Syllabus `/learn/[series]/[slug]`, `/learn/[series]` | Readable (SEO) | Readable |
| Learn hub card | Non-clickable `<div>` + "Sign in to access courses" CTA (reuse GuestCTA copy) | Clickable `<Link>` |
| Interactive tiers (quiz/check/exam/cert) | Gated (existing GuestCTA) | Unlocked per progress |
| Continue Learning section | Hidden entirely | Shown |
| Profile / Settings | Redirect → /login?next= | Shown |

---

## 4. Diagram

```mermaid
flowchart TD
  U[Browser] --> H[Header / AvatarMenu]
  U --> LP[/learn]
  U --> PP[/profile]
  U --> SP[/settings]

  LP --> LF[LearnFilters client]
  LP --> CL[ContinueLearning client]
  LP --> PC[PathCard server]
  LF -->|filter state| PC
  PC -->|guest| GUEST[Sign-in CTA div]
  PC -->|authed| LINK[Link to syllabus]

  PP --> PF[ProfileForm client]
  PP --> CS[CertificateSection]
  PF -->|PATCH| PA[/api/profile/]
  PA --> SB[(Supabase user_profiles)]
  SP --> TT[ThemeToggle client]
  TT -->|PATCH themePref| PA
  PA --> TP[ThemeProvider]
  TP -->|dark class on html| U

  CL -->|GET| CA[/api/continue-learning/]
  CA --> PGT[(lesson_completion / read_progress)]
```

---

## 5. Implementation Steps (for Kara + steel)

1. Kara: UI mockups for Learn hub (filters/subgroups/continue-learning/guest cards), Profile form, Settings appearance, avatar-menu display name + theme toggle. Update design tokens for dark (`dark` variants of navy/gray/card/surface).
2. Migration A: `user_profiles` table + policies.
3. API A: profile GET/PATCH + continue-learning GET; wire to contracts.
4. Dark B: `ThemeProvider` + `useTheme` + `dark` tokens + toggle in Settings + avatar menu; per-account persistence via PATCH.
5. Learn C: subgroup field through content pipeline; filters, subgroup headers, guest-gated PathCards, progress-on-card.
6. Continue D + Certs D: continue-learning section + My Certificates (from certificate lib + tier progress).
7. Profile E + Settings E: forms + appearance wiring; AvatarMenu display name.
8. QA (Zod): guest vs signed-in matrix, both themes on all routes, a11y contrast, keyboard nav in filters/forms/theme toggle.

---

## 6. Acceptance Criteria
- `/learn` renders group chips + subgroup headers; guests see non-clickable cards + CTA; signed-in sees clickable cards with progress-on-card.
- Continue Learning shows only in-progress series (≥1, <total), most-recent-first, with resume link to next lesson.
- `/profile` shows editable name + username fields that persist via PATCH; My Certificates reflects certificate lib eligibility.
- `/settings` Appearance toggle flips `dark` class site-wide and persists per-account; survives reload.
- Avatar menu shows display name + theme toggle.
- All gated routes/APIs use server-side HttpOnly-cookie session checks; no client RLS writes.
- `npm run prebuild` regenerates learn.ts with subgroup; all tests + tsc pass.

---

## 7. Risks
- **Dark-mode scope creep** — full-site theming touches every component (Header, MDX, cards). Mitigate: tokens-first; only new/changed surfaces must be fully dark this round; existing light-only surfaces can ship neutral.
- **Guest card gating** — must not break SEO (cards server-rendered with name/description for both states) or keyboard nav.
- **Continue-learning correctness** — "in-progress" predicate must use distinct lesson slugs; next-lesson must be lowest uncompleted.
- **Profile upsert race** — two first-reads in parallel could double-insert; use `upsert` on `user_id` conflict, or `.maybeSingle()` then insert.
- **Theme flash** — inline `prefers-color-scheme`/persisted-pref script in `<head>` (or `suppressHydrationWarning`) to avoid FOUC.
