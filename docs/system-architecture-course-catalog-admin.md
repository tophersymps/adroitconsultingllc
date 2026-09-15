# Adroit Learn — Course Catalog + Entitlements + Admin: Architecture

**Task:** t_22b26cb9 · **Author:** brainiac (architect) · **Date:** 2026-08-25
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Requirements:** `requirements/course-catalog-entitlements-requirements.md` (US-001→US-016, Plan v3 locked)
**Design inputs:** kara discovery t_5cff8203 + execution t_16658263 (design-system-course-catalog-admin.html, design-tokens-course-catalog-admin.css)
**Contract types:** `src/shared/contracts-course-catalog.ts` (tsc-clean — verified)
**DB source of truth:** `supabase/migrations/008_course_catalog.sql`
**Handoff to:** steel (implementation task t_2eab480f)

---

## 1. Architecture Summary

Adroit Learn becomes a course catalog with database-backed status + entitlements and an
admin backend. Course lifecycle (`status`) and access model live in `courses`; who has
access lives in `user_roles` + `user_entitlements` + `subscriptions`. A single
server-side access seam (`src/lib/access.ts`) is the **only** place that turns those rows
into visibility + access decisions. Every surface — catalog pages, content pages, sitemap,
static params, APIs, admin — calls the seam. The seam and RLS agree; the server seam is the
enforcement point, RLS is defense-in-depth. Payment (Stripe) is explicitly out of scope but
the model slots it in with zero access-logic changes. Blog stays public. Content stays in
`content/learn/`; DB never stores lesson bodies.

**Non-negotiable (Plan v3):** status + entitlements in the DB, never in content files.
Content and platform touch disjoint repo areas (`content/learn/` vs `src/` + `supabase/`).

---

## 2. Data Model — Supabase (migration 008)

Five new tables. All RLS policies are defense-in-depth; the server seam is the real gate.

### 2.1 `user_roles`
```sql
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
**Seeding:** migration inserts the admin row for Chris via a `WHERE email =` match against
`auth.users` (idempotent, `ON CONFLICT DO NOTHING`). Admin email constant in the migration
(`chris@adroit.io`, matching `PREVIEW_ALLOWED_EMAILS`). Users without a row default to
`member` at read time — no row = member (US-003).

**RLS:**
- SELECT: own row only (`auth.uid() = user_id`).
- UPDATE/INSERT/DELETE: admin-only via `is_admin()` helper (below). Members never self-escalate.

### 2.2 `courses`
```sql
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','live','archived')),
  access_model text NOT NULL DEFAULT 'granted' CHECK (access_model IN ('free','subscription','one-time','sub-or-one-time','granted')),
  price_cents int,
  launched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- **`series_slug` UNIQUE** — the join key to `content/learn/<series>`. A series with no
  `courses` row = "not launched" (admin-only visibility, excluded from public catalog).
- Platform fields only (status, access_model, price, launched_at). Title mirrors the
  series name for admin display; content body/syllabus always from files.

**RLS:**
- SELECT: live for everyone (`status='live'`), all rows for admins (`is_admin()`).
- INSERT/UPDATE/DELETE: admin-only.

### 2.3 `user_entitlements`
```sql
CREATE TABLE IF NOT EXISTS user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('granted','one-time')),
  grant_note text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT unique_active_entitlement UNIQUE (user_id, course_id, source)
);
```
- `source='granted'` = admin grant (US-012); `source='one-time'` = future purchase path.
- **Revoke = soft delete** (`revoked_at` set, row kept for audit/matrix history). Access
  checks filter `revoked_at IS NULL`. Re-grant after revoke inserts a new active row.

**RLS:**
- SELECT: own rows (`auth.uid() = user_id`) OR admin.
- INSERT/DELETE (revoke): admin-only.
- Members cannot read others' entitlements; the seam reads through the service client or
  admin RLS for bulk/matrix views.

### 2.4 `subscriptions`
```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'learn',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','canceled','past_due')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
- **Read-only this build.** Nothing writes it except schema (future Stripe webhook).
- `canAccessCourse` reads it for `subscription` / `sub-or-one-time` models: active access iff
  a row with status `active`/`trialing` and `current_period_end > now()`.

**RLS:** SELECT own rows OR admin; no client INSERT/UPDATE/DELETE policies (server/service only).

### 2.5 `admin_audit_log`
```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
- Written by **every** admin mutation (launch, status/access-model change, role change,
  grant, revoke, bulk grant) via the admin API. Read-only in the panel (US-015).
- `action` vocabulary: `course.launch`, `course.status_change`, `course.access_model_change`,
  `role.assign`, `entitlement.grant`, `entitlement.revoke`, `entitlement.bulk_grant`.

**RLS:** SELECT admin-only; INSERT admin-only; no client UPDATE/DELETE.

### 2.6 `is_admin()` helper (RLS backstop)
```sql
CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;
```
Used by RLS policies on all five tables so a raw client (anon key + JWT) can never read
pending/archived courses, others' entitlements, or the audit log. The **server seam** is the
authoritative check; RLS is the safety net that keeps direct PostgREST queries honest.

---

## 3. Access Seam — `src/lib/access.ts`

The single decision function every surface calls. Server-only (never imported into client
components). Three exports per the contract `AccessSeam`:

```ts
getCatalogForUser(userId): Promise<CatalogForUserResult>
decideCourseAccess(userId, seriesSlug): Promise<CourseAccessDecision>
isAdmin(userId): Promise<boolean>
```

**Decision rules (mirror US-002 exactly):**

`isAdmin(userId)` — true iff `user_roles` has a row `user_id=userId, role='admin'`. Null →
false.

`decideCourseAccess`:
1. Load `courses` row by `series_slug`. **No row → `not-launched`** (404 on content routes,
   admin-only in catalog).
2. `isAdmin` → **`admin-preview`** (pending/archived content renders for admins via dynamic
   MDX read; no sitemap/JSON-LD).
3. status not `live` and not admin → `not-launched` (non-admins never see non-live content).
4. Live: evaluate `access_model`:
   - `free` → `granted` (any signed-in user).
   - `granted` → `granted` iff active `user_entitlements` row `source='granted'`.
   - `one-time` → `granted` iff active row `source='one-time'`.
   - `subscription` → `granted` iff active `subscriptions` row (status active/trialing,
     period in future).
   - `sub-or-one-time` → `granted` iff (one-time OR granted entitlement) OR (active sub).
5. Live + not entitled → **`paywall`**.

`getCatalogForUser` — return all `courses` rows the user may **see** (live for all;
pending/archived additionally for admins), each with `visible` + `canAccess`, joined with
content-derived display fields (name/description/gradient/counts from `src/data/learn.ts`).
This drives the `/learn` hub and series list.

**Implementation notes for steel:**
- Use `getSupabaseServerClient()` (cookie-bound, RLS) for per-user reads so RLS enforces the
  same rules. Use `getSupabaseServiceClient()` (BYPASSRLS) only inside the admin API where a
  value is validated server-side — never for resolving "who is the current user".
- Cache the `courses` table read per-request via React `cache()` to avoid N+1 across
  `getCatalogForUser` + `decideCourseAccess` on the same request.
- `updated_at` triggers optional but recommended; not required for correctness.

---

## 4. Component Map

**Existing (read, extend for gating):**
- `/learn` hub (`src/app/learn/page.tsx`) — call `getCatalogForUser`, filter `visible`,
  pass `canAccess` to cards.
- `/learn/[series]` syllabus — `getCatalogForUser` + `decideCourseAccess`; status/access
  chips; syllabus stays readable (US-004), content-tier links gated.
- `/learn/[series]/[slug]` lesson — `decideCourseAccess`: `granted`→content, `paywall`→
  `PaywallView`, `admin-preview`→dynamic MDX, `not-launched`→`notFound()`.
- `/learn/[series]/check/[n]`, `/exam`, `/certificate` — same seam gate before rendering.
- `sitemap.ts`, `generateStaticParams` — include **live only** (US-004/007).
- `/api/progress/*`, `/api/continue-learning` — call `decideCourseAccess` server-side before
  accepting reads/writes; deny on `paywall`/`not-launched` (US-006).

**New components (per kara design, brand-token backed):**
- `StatusBadge` (pending/live/archived/granted) + `AccessModelChip` (5 hues) — shared across
  catalog + admin.
- `Paywall` (Decide/Learn) — server-rendered with real `PaywallAccessOption[]`.
- `AdminShell` (navy sidebar + toolbar) + `AdminTable` (dense, selectable rows) +
  `AdminStatusCell` + `GrantModal`/`BulkGrantModal` + `AdminMatrix` + `AuditLogView`.
- Client hooks: `useAdminCourses`, `useAdminUsers`, `useAdminAudit` (fetch admin APIs).

---

## 5. Admin Backend

**Routes (all role-gated server-side — US-016):**
- `src/app/admin/layout.tsx` — `isAdmin` guard; non-admin → `notFound()`.
- `src/app/admin/page.tsx` — course management (US-009).
- `src/app/admin/users/page.tsx` — user list + search/filter (US-010).
- `src/app/admin/matrix/page.tsx` — user-course matrix (US-014).
- `src/app/admin/audit/page.tsx` — audit log (US-015).

**API routes:**
| Method/Path | Body | Action (US) |
|---|---|---|
| `GET /api/admin/courses` | — | List courses + entitlement counts (009/014) |
| `PATCH /api/admin/courses/[slug]` | `AdminCourseUpdateRequest` | status/access_model/price; launch sets `launched_at` (009) |
| `GET /api/admin/users?q=` | — | List users, filter by name/email (010) |
| `GET /api/admin/users/[id]` | — | User + entitlements (010/014) |
| `PATCH /api/admin/users/[id]/role` | `SetRoleRequest` | Assign/demote role (011) |
| `POST /api/admin/entitlements` | `GrantEntitlementRequest` | Grant w/ note (012) |
| `POST /api/admin/entitlements/bulk` | `BulkGrantRequest` | Bulk grant (013) |
| `DELETE /api/admin/entitlements` | `GrantEntitlementRequest` (revoke) | Soft revoke (012) |
| `GET /api/admin/audit` | — | Read audit log (015) |

**Every admin mutation** (launch, status/access-model change, role change, grant, revoke,
bulk grant) writes an `admin_audit_log` row with `actor_user_id` (from the session),
`action`, `target_type`/`target_id`, and `details` (old→new, grant note, bulk count).

**Security (US-016):** every admin route handler checks `isAdmin` **first** and returns
404/403. Non-admin direct calls to `/api/admin/*` → 403. A failed admin action is visible
in server logs (and where applicable the audit log). Hiding the nav is never the only guard.

---

## 6. Data Flow

```
Member hits /learn/[series]/[slug]
  → server component
  → getSupabaseServerClient() (cookie → auth user)
  → src/lib/access.ts decideCourseAccess(userId, seriesSlug)
       ├─ load courses row (RLS: live visible)
       ├─ isAdmin? → admin-preview
       ├─ no row / not live → not-launched → notFound()
       ├─ live + entitled (model eval on user_entitlements / subscriptions) → granted
       └─ live + not entitled → paywall
  → granted: render MDX content (content/learn/<series>/<slug>.mdx)
  → paywall: render <Paywall options={modelOptions} peek={firstLesson} />
```

```
Admin launches course
  → /admin → PATCH /api/admin/courses/[slug] {status:'live'}
  → isAdmin check (403 if not)
  → update courses row (service client) + set launched_at
  → insert admin_audit_log (course.launch)
  → next /learn request: getCatalogForUser returns course visible → public
```

---

## 7. Implementation Steps (for steel)

1. **Migration 008** — create 5 tables + indexes + RLS + `is_admin()` + admin seed.
   Apply with `supabase db push`. Verify `npx supabase db lint` / migration applied.
2. **Contract file** already written (`src/shared/contracts-course-catalog.ts`) — import from it.
3. **`src/lib/access.ts`** — implement `isAdmin`, `getCatalogForUser`, `decideCourseAccess`
   + unit tests (member/guest/admin, all five access models, not-launched).
4. **Gating sweep** — wire seam into hub, series, lesson, check, exam, cert, sitemap,
   `generateStaticParams`, progress + continue-learning APIs.
5. **Admin backend** — layout guard + 4 pages + 9 API routes + audit logging + client hooks.
6. **Paywall + badges** — `StatusBadge`, `AccessModelChip`, `Paywall` components (kara tokens).
7. **Tests** — access seam unit tests + route notFound/403 gate tests; `npm run build` clean.

---

## 8. ADRs

| ID | Title | Decision | Context | Consequences |
|----|-------|----------|---------|--------------|
| ADR-200 | Status + entitlements in DB | `courses.status` / `user_entitlements` in Supabase, never content files | Daily Planet authors content in parallel without platform deploys | DB is source of truth; content and platform touch disjoint dirs |
| ADR-201 | Single server access seam | `src/lib/access.ts` is the only decision function | Every surface must enforce the same rules | One place to change; all pages/APIs funnel through it |
| ADR-202 | RLS as defense-in-depth | RLS mirrors server checks via `is_admin()` | Direct PostgREST must be honest too | Server seam is authoritative; RLS prevents client-side leaks |
| ADR-203 | Soft revoke | `user_entitlements.revoked_at` set, row kept | Preserve audit/matrix history on revoke | Access checks filter `revoked_at IS NULL`; re-grant = new row |
| ADR-204 | Payment out of scope, model ready | `subscriptions` read-only; `one-time` source reserved | Stripe later with zero access-logic changes | No payment code ships now; model is future-proofed |
| ADR-205 | Admin mutations audited | every admin action writes `admin_audit_log` | Trace who launched/granted/revoked/changed role | Read-only panel view; write path server/service only |
| ADR-206 | Admin routes role-gated server-side | layout guard + per-handler `isAdmin` → 404/403 | Nav hiding is never the only protection | Defense-in-depth; non-admin direct calls rejected |

---

## 9. Acceptance Criteria (for zod / QA)

1. `getCatalogForUser`: live visible to all; pending/archived visible to admins only.
2. `decideCourseAccess`: free→granted (signed-in), subscription/one-time/sub-or-one-time→
   entitled only; granted→entitlement row; no row/not live→not-launched.
3. Non-entitled member on a live lesson sees the paywall (never content, never 404).
4. Non-admin on `/admin` or `/api/admin/*` → 404/403 server-side.
5. Sitemap + `generateStaticParams` exclude pending/archived.
6. Grant/revoke/launch/role-change write + visibly confirm an audit-log row.
7. Bulk grant writes one row per selected user.
8. Blog routes unchanged and fully public.
9. `npm run build` passes; access seam + gate tests green.

---

## 10. Risks

- **DB not pushed / RLS misconfigured** → surfaces 500 or leak. Mitigation: apply migration
  008 in task A, verify policies, keep server seam authoritative.
- **`courses` row missing for an existing series** → whole series 404s for members.
  Mitigation: seed `live` rows for the current published series in migration 008 (they exist
  in content), and treat "no row" as not-launched only for truly-new series.
- **Force-dynamic cost** — lesson/series pages already `force-dynamic`; seam adds a DB read
  per request. Acceptable at blog traffic; cache `courses` per-request.
- **admin API origin/CSRF** — apply existing `checkOrigin` + rate-limit from
  `api-security.ts` to all admin POST/PATCH/DELETE.
- **Service client misuse** — keep `getSupabaseServiceClient()` confined to admin API writes;
  never for resolving the current user.
