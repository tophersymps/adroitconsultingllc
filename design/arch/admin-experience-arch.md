# Adroit Admin Experience Redesign — Build Contract (Architecture)

**Task:** t_d1f9fb17 · **Author:** brainiac (architect) · **Date:** 2026-08-31
**Type:** ARCHITECTURE → build contract for steel (implementer) from Kara's approved EXECUTION mockups
**Feeds from:** Kara EXECUTION mockups (t_e0eef05c) `design/mockups/admin-experience/` · Discovery brief (t_19aaee7f) `design/discovery/admin-experience-redesign.md` · Tokens `design/discovery/admin-experience-tokens.css`
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Deliverable type:** `architecture` (no production code in this task)

---

## 0. Scope Guard (non-negotiable)

- **Billing/coupons/trials: design affordances ONLY.** No Stripe, no schema migration, nothing implying billing is live. `coupons`/`coupon_redemptions`/`stripe_id` are **notes**, not migrations.
- **No production code in this task.** Contract document only.
- **`src/shared/contracts-course-catalog.ts` is brainiac-owned.** Workers must NOT edit it directly. If a contract must change, brainiac owns it here (this task). Where a type must be added/changed, it is documented in §7 and owned in this file, not edited by steel.
- **Reconcile with PR #170 (merged matrix subscription fix).** The `subscription` field on `AdminUserListRow` and its population in the users routes already exist. Do NOT duplicate — extend, don't re-add.

---

## 1. Admin IA Rework — Organize by Admin Job

### 1.1 Target sidebar (Kara design-system.html §1 / discovery §2)

```
Adroit Admin
────────────
ACCESS                      ← the admin's #1 job, front and center
  Overview                 (governance health at a glance — Monitor-in-Operate)
  People                   (person-first — who has what, grant/adjust)
  Courses                  (course-first roster — who has access to THIS course, bulk)
CONTENT
  Catalog                  (course lifecycle: status, access model, price, launch)
SYSTEM
  Analytics
  Audit Log
  Offers · Coupons         (placeholder — "Coming with billing")
```

### 1.2 Route/tab map — current → new

| Current route | Current nav label | New route | New nav label | Action |
|---|---|---|---|---|
| `/admin` | Dashboard | `/admin` | Access · Overview | **Reorganize** — becomes Access Overview (governance health). Absorbs pending-launch banner + stat cards + recent audit + entitlements-per-course, adds effective-access coverage + subscriber pulse + access-gap callout. |
| `/admin/users` | Users | `/admin/users` | Access · People | **Reorganize** — person-first Access Panel (role + per-course five-state chips + Grant/Revoke/Adjust inline). Drop the crude per-row course dropdown. |
| `/admin/matrix` | Access Matrix | — (killed) | — | **Kill.** Its job absorbed into People + Courses sharing the `AccessGrid` component. Remove the page + nav entry. The `matrix/page.tsx` file is deleted; `matrix/page.test.tsx` replaced by AccessGrid + lens tests. |
| `/admin/courses` | Courses | `/admin/courses` | Content · Catalog | **Reorganize (label only).** Course lifecycle table stays (status/access-model/price/launch/edit). Re-parented under CONTENT in the sidebar. Keep LaunchDialog + CourseProfileDialog. |
| `/admin/access/courses` | — | `/admin/access/courses` | Access · Courses | **New** — course-first roster + bulk grant/revoke + AccessGrid. |
| `/admin/analytics` | Analytics | `/admin/analytics` | System · Analytics | **Stay** (unchanged) — re-parented under SYSTEM. |
| `/admin/audit` | Audit Log | `/admin/audit` | System · Audit Log | **Stay** (unchanged) — re-parented under SYSTEM. |
| — | — | `/admin/offers` | System · Offers · Coupons | **New placeholder** — honest empty state "Coming with billing". No build beyond a static read-only page. |

### 1.3 Route decisions (brainiac-owned, steel must follow)

- **Keep the existing route paths `/admin`, `/admin/users`, `/admin/courses`** (don't move files that already work; only relabel + rework content). Avoid churn/redirects for established deep links.
- **Kill `/admin/matrix`** — delete `src/app/admin/matrix/page.tsx` and its test. Its truth-table role is re-homed into the shared `AccessGrid` component used by both People and Access·Courses.
- **New pages:** `/admin/access/courses` (roster lens) + `/admin/offers` (placeholder). Both gated by the existing `/admin/layout.tsx` `requireAdminPage` guard (no per-page guard needed — the layout covers all admin routes).
- **`AdminShell.tsx` NAV** is the single source of sidebar truth. Regroup into `ACCESS` / `CONTENT` / `SYSTEM` sections per §1.1. The "Active nav" highlight uses `pathname.startsWith(href)` so `/admin` (Overview) needs `exact: true` to not highlight every admin route (already the pattern for Dashboard).

### 1.4 Component map (stay / reorganize / new)

**Stay (reuse as-is or lightly relabel):**
- `AdminShell.tsx` — edit NAV only.
- `LaunchDialog.tsx`, `CourseProfileDialog.tsx` — unchanged (used by Content·Catalog).
- `StatusBadge.tsx`, `AccessModelChip.tsx` — unchanged (shared vocabulary).
- `useAdminCourses.ts`, `useAdminAudit.ts`, `useAdminAnalytics.ts` — unchanged.
- `/admin/analytics`, `/admin/audit` pages — unchanged.

**Reorganized:**
- `src/app/admin/page.tsx` → Access Overview (client page, reframed; reuse existing hooks).
- `src/app/admin/users/page.tsx` → Access · People (person-first panel).
- `src/app/admin/courses/page.tsx` → Content · Catalog (table stays, minor copy/label; add a "Preview first lesson →" convenience link per row for admins — admin-preview already renders content, so this links into the same preview route, see §3).
- `useAdminUsers.ts` → extend with an `adjustSource` helper (adjust = revoke+regrant one-time↔granted in one action, one audit row).

**New:**
- `src/components/Admin/EffectiveAccessChip.tsx` — five-state chip (granted/one-time/subscribed/free/none). Uses `--access-*` tokens. AccessGrid cell variant (26px circle, single letter G/O/S/F/—).
- `src/components/Admin/AccessGrid.tsx` — user × course matrix rendering the five-state chip language; shared by People + Access·Courses. Dense, checkbox column for bulk, hover/selected states, cell click → action popover.
- `src/components/Admin/AccessPanel.tsx` — person-first panel (People lens): role select + per-course five-state chips + Grant granted / Grant one-time / Revoke / Adjust inline + subscription subline.
- `src/components/Admin/RosterPanel.tsx` — course-first roster (Courses lens): every user's effective-access chip + bulk grant/revoke.
- `src/components/Admin/AccessGrid.stories.tsx` + test files.
- `src/app/admin/access/courses/page.tsx` — new page.
- `src/app/admin/offers/page.tsx` — new placeholder page.
- `src/app/learn/[series]/preview/page.tsx` — preview-first-lesson route (see §3 — the critical item).
- `src/components/Learn/PreviewFirstLesson.tsx` — the preview variant component (amber strip + readable excerpt + locked seam + unlock CTA). (Reuse the existing `PreviewStrip` pattern / `--preview-strip-*` tokens.)

---

## 2. Five-State Effective-Access Model

### 2.1 The model

Every user × course pair resolves to exactly one of five states, computed from the **existing `access.ts` seam** — the admin shows the seam's truth, never "empty = no access":

| State | Meaning | Source (computed) |
|---|---|---|
| `granted` | Admin-granted entitlement | `user_entitlements.source='granted'`, `revoked_at` NULL |
| `one-time` | Purchased one-time | `user_entitlements.source='one-time'`, `revoked_at` NULL |
| `subscribed` | Active/trialing subscription grants it | `subscriptions.status IN (active, trialing)` + `courseGrantsAccess` (sub / sub-or-one-time) |
| `free` | Course `access_model='free'` → everyone has it | `course.access_model='free'` |
| `none` | No entitlement, no sub, not free → locked | everything else |

### 2.2 Confirm: NO schema change

The five states are fully computable from:
- `course.access_model` (in `courses` — already on `AdminCourseListRow.course`),
- active entitlements (`user_entitlements` — already on `AdminUserListRow.entitlements`),
- the user's subscription (`subscriptions` — already on `AdminUserListRow.subscription`, added by PR #170).

No new column, no new table. **Confirmed: the admin can compute these five states from the existing seam + `subscriptions` table WITHOUT schema change.**

### 2.3 Exact accessor/contract changes

**Add a pure state resolver to `src/lib/access.ts`** (mirrors `decideCourseAccessFromInput`; unit-testable without a DB). This is the single function both the admin surfaces AND the gate can share so the panel and gate never disagree:

```ts
export type EffectiveAccessState =
  | "granted" | "one-time" | "subscribed" | "free" | "none";

export function effectiveAccessState(input: {
  course: CourseRow | null;
  entitlements: UserEntitlementRow[];   // active (non-revoked)
  subscriptions: SubscriptionRow[];     // any status
  now: string;
}): EffectiveAccessState
```

Resolution order (authoritative):
1. `course == null` OR `course.status !== "live"` → treat as `none` for display purposes on a live-only lens (admin sees pending/archived separately via Catalog; the AccessGrid shows live courses). *(Grid may choose to show pending/archived rows dimmed via `AccessModelChip` + status, but the effective-access cell resolves against the live model.)*
2. `course.access_model === "free"` → `free`.
3. a `granted` entitlement for `course.id` (active) → `granted`.
4. a `one-time` entitlement for `course.id` (active) → `one-time`.
5. `courseGrantsAccess(model, entitlements, subscriptions, now, course.id)` is true because a subscription grants it → `subscribed`.
6. else → `none`.

> Precedence note: an admin-granted entitlement beats a subscription for the same course (granted > one-time > subscribed > free > none). This makes the chip unambiguous when a user holds both an entitlement and a sub.

**Contract type change (owned by brainiac in this task — steel does NOT edit the contracts file):**
Add `EffectiveAccessState` to `src/shared/contracts-course-catalog.ts` (§Admin API section) and reference it on the accessor. This is a brainiac-owned additive type — no conflict with PR #170.

### 2.4 Reconcile with PR #170 — DO NOT duplicate

- `AdminUserListRow.subscription: SubscriptionRow | null` — **already exists** (PR #170). Keep it. It carries the single currently-active/trialing sub.
- `GET /api/admin/users` and `GET /api/admin/users/[id]` — **already populate `subscription`** via `activeSubscriptionOf()`. Keep.
- **Do NOT re-add a `subscription` field or re-route subscription reads.** What the redesign adds is:
  1. the pure `effectiveAccessState` resolver (§2.3),
  2. a **new admin accessor endpoint** (`GET /api/admin/access/effective`, §5) that returns each course's model + each user's entitlements + each user's subscription so the AccessGrid can resolve five states — a *consolidated* read, not a duplicate of per-user routes,
  3. the UI components (EffectiveAccessChip / AccessGrid / AccessPanel / RosterPanel).

The current `matrix/page.tsx` already special-cases `sub` and `SUB_GATED_MODELS` for subscription/sub-or-one-time — that logic is replaced wholesale by the unified `effectiveAccessState` resolver. **Delete it with the matrix page** (§1.3) rather than extending it.

---

## 3. Preview-First-Lesson Route — THE Critical Item

### 3.1 The bug being fixed (confirmed in code)

`Paywall.tsx` links "Preview this course →" to `/learn/[series]/[peekLessonSlug]` (the first lesson). That lesson page re-runs `decideCourseAccess` → returns `paywall` → renders the Paywall **again**. **Infinite loop — the button genuinely does nothing.**

Also: wording says "Preview this course" but the affordance previews ONE lesson. Reword everywhere to **"Preview first lesson →"**.

### 3.2 Decision: dedicated route `/learn/[series]/preview` (NOT `?preview=1`)

**Chosen:** dedicated read-only route **`/learn/[series]/preview`**.

Rationale (vs the `?preview=1` query param on the first lesson):
- A dedicated route is a **distinct URL** — clean SEO noindex (one path), shareable, and doesn't thread preview state through the existing lesson page's params/props.
- It **never re-enters the paywall branch** by construction: it's a separate page file that renders lesson 1's readable excerpt directly, with no path back to `buildPaywallView` unless the user clicks the CTA.
- Next.js static segment precedence: `/learn/[series]/preview` is a distinct static segment and does not collide with `/learn/[series]/[slug]` (preview is not a lesson slug; even if a future lesson were slugged `preview`, the static segment wins — flag this as an accepted constraint, `preview` is a reserved slug).
- Query-param approach would require the lesson page to detect `searchParams.preview` and branch — risk of the branch being missed or the loop persisting through links that drop the param.

**Confirmed: NO schema change.** One new read-only route + a preview component + reworded button wiring.

### 3.3 Route files & shape

**New file: `src/app/learn/[series]/preview/page.tsx`** (server component, `export const dynamic = "force-dynamic"` — must evaluate the seam per request; never statically prerendered).

Behavior:
1. Resolve `series`. `getSeriesBySlug(series)` null → `notFound()`.
2. Resolve the first **published** lesson: `const first = getLessonsForSeries(series)[0]`; if none → `notFound()` (nothing to preview).
3. **Access gate (the paywall-bypass):** `const userId = await getAccessUserId(); const decision = await accessSeam.decideCourseAccess(userId, series);`
   - `decision.kind === "not-launched"` → `notFound()` (course not live / no row — same as the real lesson page).
   - `decision.kind === "granted"` or `"admin-preview"` → **`redirect(`/learn/${series}/${first.slug}`)`** — a user who can already read the lesson gets the REAL lesson, never the preview variant (mockup + discovery §6: "a granted user never sees it").
   - `decision.kind === "paywall"` → render the **preview variant** (below).
4. Load lesson-1 content: `getLearnMDXContent(series, first.slug)`, `stripMDXFrontmatter`, `linkifySourceCitations` (mirror the real lesson page).
5. Resolve the course + access options for the CTA: `const courseRow = await getCourseRowBySlug(series)` and `buildPaywallView({ course: courseRow, series: seriesInfo, peekLessonSlug: first.slug })`. **This reuses `buildPaywallView` access options as the CTA target** — the "Unlock full course →" CTA carries the exact options the user would see on the paywall, but the preview page itself renders readable lesson-1 content (it does NOT render the Paywall panel).
6. Render `<PreviewFirstLesson view={paywallView} lesson={first} mdx={mdxBody} seriesSlug={series} totalLessons={seriesInfo.totalLessons} />`.

**New component: `src/components/Learn/PreviewFirstLesson.tsx`** (server-compatible) renders, per mockup-preview-first-lesson.html:
- **Amber `--preview-strip-*` band** (top): badge "Preview" + "You're previewing **lesson 1 of N** …" + a dismissible × and an "Unlock full course →" button (both the strip CTA and the bottom CTA go to the same paywall-options target).
- **Lesson-1 hero** (title, author row, tags, date/read-time) + **readable excerpt** (the peek — the leading paragraphs of lesson 1's body).
- **Locked seam**: after the readable excerpt, apply `.preview-locked`/`.preview-lock-seam` opacity + gradient fade to the remainder, with a seam note "🔒 Content locked — subscribe to continue".
- **Unlock CTA block**: navy `unlock-cta` panel — "Unlock the full course", benefits, a red "Unlock full course →" primary button, fine print "choose subscription or one-time".
- CTA target (both strip + bottom): **`/learn/${seriesSlug}/${view.peekLessonSlug}`** — i.e. link back to the first lesson's real route. Because the user is still `paywall`, that route re-runs `decideCourseAccess` → renders the **Paywall with `buildPaywallView` access options**. This is the intended terminal: preview → CTA → paywall access options (subscribe / one-time / granted-info). **This is NOT a loop** — the preview page renders once and hands off; the paywall is the decision surface, not a re-render of the preview.
- **ReadingProgress** disabled in preview (read-only; no completion/mark-complete/quiz in preview). Keep `<Header />` + `<Footer />`. **noindex** metadata (mirror `/preview/*` pattern).
- **Motion + dark mode:** respects `prefers-reduced-motion`; `html.dark` remap from the tokens.

### 3.4 Paywall-bypass mechanism (explicit)

The existing lesson page `src/app/learn/[series]/[slug]/page.tsx` **is NOT modified** for the bypass. The bypass is achieved by the new route never entering the paywall branch — it is a *separate* page that renders lesson-1 content directly for a `paywall`-decided user. No `?preview=1` parameter, no change to the `paywall` branch of the real lesson page. This keeps the gate honest: the preview route is itself gated by the same seam; a granted/admin user is redirected to the real lesson.

### 3.5 Button wiring

1. **`src/components/Catalog/Paywall.tsx`** — reword the peek link: `Preview this course` → **`Preview first lesson →`**, `href` from `/learn/${seriesSlug}/${view.peekLessonSlug}` → **`/learn/${seriesSlug}/preview`**. (Keep the `view.peekLessonSlug ?` null guard — if a series has no published lesson, no preview link renders.)
2. **Public catalog card (`PathCard.tsx`)** — for a signed-in-but-locked (non-guest, non-empty) card, the existing card links to `/learn/${series.slug}` which itself 404s→? No — the series landing renders the syllabus even when locked (US-004, per `learn/[series]/page.tsx`). The "Preview first lesson →" affordance is primarily on the Paywall. **Add a subtle "Preview first lesson →" link** on locked PathCards that points to `/learn/${series.slug}/preview` (when `!canAccess`). *(Steel: wire this; if PathCard doesn't carry `canAccess`, the card's lock state is derivable from the same catalog entry the hub already passes — see §3.6.)*
3. **Admin Catalog (`/admin/courses` page rows)** — add a "Preview first lesson →" convenience link per row → `/learn/${course.series_slug}/preview`. For an admin, `decideCourseAccess` returns `admin-preview` → the preview route redirects to the real lesson 1 (admin sees full content, as today). This is the "admins also get a Preview first lesson →" discovery item (§6.4).
4. **LaunchDialog** — already has a "preview exactly as learners see it" step (kept, unchanged). Optionally the pending preview step's "Open preview →" can link to the new preview route for a non-admin-preview look; steel may leave as-is (out of critical path).

### 3.6 PathCard `canAccess` (small contract note)

`PathCard` receives `LearnCardSeries`. To render the locked-preview link it needs a `canAccess` flag. The learn hub already computes per-course access via `getCatalogForUserV2` → `toLearnHubCards`. **Add `canAccess: boolean` to the `LearnCardSeries` projection** (or a separate `canAccessById` prop) — owned by brainiac in the contracts file; steel wires the data through `toLearnHubCards`. If the hub's card projection change is non-trivial, the lower-risk alternative is to render the "Preview first lesson →" link unconditionally for signed-in cards (a granted user gets redirected to the real lesson anyway, so the link is never harmful). **Preferred: add `canAccess` to `LearnCardSeries`** so the UI doesn't show "Preview" on a course the user already owns.

---

## 4. Coupons / Trials / One-Time — Design-Time Affordances ONLY

### 4.1 What ships NOW (no build beyond empty states)

- **`/admin/offers` placeholder page** (static, read-only): header "Offers · Coupons", honest empty state "Coming with billing — no offers yet." Per the "never a dead-end" rule. No API, no DB, no Stripe.
- **Overview subscriber pulse** renders counts by `subscriptions.status`; when zero subs → "Subscribers · 0 — billing on hold" (honest empty state, not a dead end). This is derived from the same accessor read (§5) — read-only.
- **Access Panel subscription subline** — shows the active/trialing sub + "Plan · renews date"; with no sub → "No active subscription / Coming with billing".

### 4.2 Schema NOTES (for future — NOT migrations, nothing ships)

Documented for when billing lands (brainiac owns these as design notes; steel must NOT create them):

```
-- FUTURE (no build now) — proposed shape only
coupons (
  id            uuid pk
  code          text unique not null          -- e.g. LAUNCH20
  kind          text not null                -- 'percent' | 'amount'
  value         numeric not null            -- 20 or 1500 (cents for amount)
  applies_to    text not null               -- 'course' | 'plan'
  course_id     uuid null                   -- when applies_to='course'
  max_redemptions int null
  expires_at    timestamptz null
  created_at    timestamptz default now()
)
coupon_redemptions (
  id           uuid pk
  coupon_id    uuid not null ref coupons(id)
  user_id      uuid not null
  applied_at   timestamptz default now()
)
-- ALTER TABLE subscriptions ADD COLUMN stripe_id text NULL;  -- future nullable
```

**Nothing implies billing is live.** No migration file, no `subscriptions` column change, no Stripe SDK, no checkout API.

---

## 5. API Contract

### 5.1 New endpoint

**`GET /api/admin/access/effective`** (admin-only, read-only) — the consolidated five-state accessor read that powers AccessGrid, People panel, and Courses roster. Returns everything needed to resolve five states + the subscriber pulse, in one round-trip (avoids N+1 per-user detail fetches that the current matrix does).

Request: none (admin session cookie gates it).

Response:
```ts
interface AdminAccessEffectiveResponse {
  ok: true;
  data: {
    // Live courses the AccessGrid shows (access-model chip + status for dimming)
    courses: AdminCourseListRow[];            // reuse existing row type
    // Users + their entitlements + their active subscription
    users: AdminUserListRow[];                // reuse existing row type (has .entitlements + .subscription from PR #170)
    // Resolved five-state per user × course (course_id → state)
    matrix: Record<string, Record<string, EffectiveAccessState>>;  // users[].user_id → courses[].course.id
    // Subscriber pulse — counts by status (for Overview)
    subscriberPulse: { active: number; trialing: number; canceled: number; past_due: number };
  };
}
```

Implementation notes for steel: service-client reads of `courses`, `user_roles`, `user_profiles`, `user_entitlements` (active), `subscriptions`; compose `AdminUserListRow` (reuse the existing shape/logic from `/api/admin/users`) then run each user × course through `effectiveAccessState` (imported from `src/lib/access.ts`). Read-only — no writes, no audit log.

### 5.2 Modified endpoints

- **`/api/admin/users` & `/api/admin/users/[id]`** — **no change** (already return `subscription` per PR #170). The new `effective` endpoint is additive; existing per-user routes remain for the People panel's row-level grant/revoke flow.
- **`/api/admin/courses`** — no change.

### 5.3 Existing write endpoints (reused, unchanged)

| Endpoint | Method | Purpose | Read-only? |
|---|---|---|---|
| `/api/admin/entitlements` | POST | Grant granted (single) | **write** → audit |
| `/api/admin/entitlements` | DELETE | Revoke (soft) | **write** → audit |
| `/api/admin/entitlements/bulk` | POST | Bulk grant | **write** → audit |
| `/api/admin/users/[id]/role` | PATCH | Set role | **write** → audit |
| `/api/admin/courses/[slug]` | PATCH | status/access-model/price | **write** → audit |
| `/api/admin/courses/[slug]/preview` | GET | Launch readiness | read |
| `/api/admin/courses`, `/users`, `/audit`, `/analytics` | GET | list/read | read |

**Adjust = revoke + regrant (one-time↔granted).** No new adjust endpoint: the AccessPanel's "Adjust" performs `DELETE /entitlements` then `POST /entitlements` (or a new source-aware variant) and writes **one** `admin_audit_log` row for the composite action. Steel may add an `action: "entitlement.adjust"` audit action key (extend `writeAuditLog` action vocabulary + `ACTION_TAG` map in the Overview) — a small, safe extension.

### 5.4 Confirmed: NO billing write path exists anywhere

Scanned `src/`: the only `billing`/`subscription` references are the **read-only display** contract comment (ADR-204 "billing on hold") and the `subscriptions` read in the admin users routes. **There is no Stripe, no checkout, no `subscriptions` write, no `coupons` code anywhere.** The design ships no billing write path. **Confirmed.**

---

## 6. Tests (what steel adds)

1. **`src/lib/access.test.ts`** — unit tests for `effectiveAccessState` (pure): every state, precedence (granted > one-time > subscribed > free), free model, none fallback, revoked-entitlement ignored, canceled/past_due sub ignored, admin-preview/not-launched handling. (Mirror existing seam test style.)
2. **`src/app/learn/[series]/preview/page.test.tsx`** — route tests:
   - `paywall` user → renders preview variant (amber strip present, "lesson 1 of N", unlock CTA target = `/learn/{series}/{firstSlug}`).
   - `granted`/`admin-preview` user → redirected to `/learn/{series}/{firstSlug}` (real lesson).
   - `not-launched` / missing series / no published lesson → 404.
   - no schema touched; no quiz/complete UI in preview.
3. **`src/components/Admin/AccessGrid.test.tsx`** — five-state rendering; cell click opens action popover; bulk checkbox header drives row selection; dark-mode classes; accessibility (role, labels, focus).
4. **`src/components/Admin/EffectiveAccessChip.test.tsx`** — renders all five states + grid single-letter variant; a11y.
5. **`src/app/admin/access/courses/page.test.tsx`** — roster loads from `/api/admin/access/effective`; bulk grant calls `/entitlements/bulk` with selected ids; one audit row per user (verify via mock); empty state.
6. **`src/app/admin/users/page.test.tsx`** (update existing) — Access Panel: role change → `/users/[id]/role`; grant/revoke/adjust → `/entitlements`; subscription subline empty state.
7. **`src/app/admin/page.test.tsx`** (update existing) — Overview: effective-access coverage counts, subscriber pulse empty state ("billing on hold"), access-gap callout, pending-launch banner retained.
8. **`src/app/api/admin/access/effective/route.test.ts`** — admin-gated (403 non-admin); shape of `matrix`/`subscriberPulse`; reconciles with existing `users` route shape (no duplicate `subscription` field drift).
9. **`src/components/Catalog/Paywall.test.tsx`** (update existing) — link text now "Preview first lesson →", href `/learn/{series}/preview`; null-guard when no peek lesson.
10. **PathCard** — locked card renders "Preview first lesson →" when `canAccess=false`; granted cards don't.
11. Remove/replace `src/app/admin/matrix/page.test.tsx`.

---

## 7. ADRs

| ID | Title | Context | Decision | Consequences |
|---|---|---|---|---|
| ADR-220 | Effective-access five-state model | Matrix conflates "no entitlement row" with "no access" and ignores subscriptions | Resolve every user×course to granted/one-time/subscribed/free/none via a pure `effectiveAccessState` in `access.ts` | Admin matches the learner gate exactly; no schema change; single resolver reused by AccessGrid + panel + roster |
| ADR-221 | Preview-first-lesson as dedicated route | Paywall's "Preview this course" links to the first lesson which re-renders the paywall (loop) | New read-only `/learn/[series]/preview` that renders lesson 1 for a `paywall` user and redirects granted users to the real lesson | Clean URL, no `?preview` plumbing, no change to the lesson page's paywall branch; `preview` is a reserved slug |
| ADR-222 | Kill standalone Matrix page | Users + Matrix both grant access; neither is honest | Delete `/admin/matrix`; absorb into People + Access·Courses sharing `AccessGrid` | One Access job with two lenses; deletes the conflating grid and its G/P-only logic |
| ADR-223 | Consolidated admin accessor endpoint | Matrix does N+1 per-user detail fetches; five-state needs course model + entitlements + sub | Add `GET /api/admin/access/effective` returning courses + users + resolved matrix + subscriber pulse | One round-trip for grid/panel/roster/overview; reuses PR #170's `AdminUserListRow.subscription` (no duplication) |
| ADR-224 | Billing/coupons as empty-state affordances | Subscriptions table exists; billing not live | Ship only honest empty states + schema NOTES; no Stripe, no migration, no write path | Design is billing-ready without implying it's live; future deltas are docs only |

---

## 8. Build Decomposition (for steel + orchestrator)

Dependencies map the integration order. `handoff_to: kara` per pipeline (designer already delivered mockups; steel implements next).

| Task | Assignee | Produces | Depends on |
|---|---|---|---|
| T1: Add `EffectiveAccessState` type + pure `effectiveAccessState()` in `access.ts` | steel | `src/lib/access.ts` + unit tests | (contract owned by brainiac — type lives in contracts file) |
| T2: `GET /api/admin/access/effective` endpoint | steel | `src/app/api/admin/access/effective/route.ts` + route test | T1 |
| T3: `EffectiveAccessChip` + `AccessGrid` components | steel | `src/components/Admin/*` + tests | T2 (grid needs the accessor data) |
| T4: `AccessPanel` (People lens) + rework `/admin/users` | steel | `src/app/admin/users/page.tsx` + test | T3 |
| T5: `RosterPanel` (Courses lens) + new `/admin/access/courses` | steel | `src/app/admin/access/courses/page.tsx` + test | T3 |
| T6: `AdminShell` NAV regroup + `/admin/offers` placeholder + kill matrix | steel | `AdminShell.tsx`, `offers/page.tsx`, delete matrix | T4, T5 (nav references both lenses) |
| T7: Preview-first-lesson route + `PreviewFirstLesson` component | steel | `src/app/learn/[series]/preview/page.tsx`, `PreviewFirstLesson.tsx`, Paywall.tsx reword, PathCard link | T1 (reuses seam), contracts owned by brainiac |
| T8: Overview rework (`/admin` → governance health) | steel | `src/app/admin/page.tsx` + test | T2 (subscriber pulse + coverage), T6 |
| T9: Integration + full test pass | steel | green test suite | T1–T8 |

---

## 9. Handoff to Kara (pipeline note)

Kara's EXECUTION mockups are already approved (t_e0eef05c) and verified light+dark. No further design work is blocked on architecture. `handoff_to` for the *pipeline* is `kara` (already delivered), and this contract is the **implementation blueprint for steel**. Steel builds from Kara's mockups + tokens + this contract; Zod QAs against the acceptance criteria in the discovery brief §9.

---

## 10. Verification Checklist (brainiac self-check)

- [x] Contract covers IA rework, five-state model, preview-first-lesson route, coupons/trials affordances, API contract, tests.
- [x] Preview-first-lesson route fully specified (shape, files, paywall-bypass, CTA, button wiring) — §3.
- [x] No production code written (this is a document-only task).
- [x] No billing build, no Stripe, no schema migration (coupons/trials are NOTES only — §4.2).
- [x] Reconciles with merged PR #170 — `subscription` field/reads reused, not duplicated (§2.4, §5.4).
- [x] `contracts-course-catalog.ts` changes owned by brainiac (additive `EffectiveAccessState` + `LearnCardSeries.canAccess`) — documented, not edited by steel.
