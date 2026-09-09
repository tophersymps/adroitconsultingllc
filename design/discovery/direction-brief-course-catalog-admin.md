# Adroit Learn — Course Catalog + Admin: Design Direction Brief (Discovery)

**Task:** t_5cff8203 · **Author:** kara (designer) · **Date:** 2026-08-25
**Type:** DISCOVERY → feeds Execution task t_16658263 (compose mockups + design-system.html)
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Requirements:** `requirements/course-catalog-entitlements-requirements.md` (US-001 → US-016, Plan v3 locked)

---

## 1. Surface Archetypes (committed before tokens)

| Screen | Surface | Why |
|---|---|---|
| `/admin` — course mgmt, user mgmt, role assignment, grant/revoke, bulk grant, matrix, audit | **Operate** (primary; Monitor secondary on the audit log) | Admin is an operations console. Density, action affordances, and selection state dominate. No hero, no decorative stat cards. |
| `/learn` hub + `/learn/[series]` syllabus | **Explore** (extend existing) | Already designed Explore surfaces. This work ADDS status badges + entitlement chips + gated rows to the existing card language — it does not re-layout. |
| `/learn/[series]/[slug]` gated lesson → paywall | **Decide/Learn** | When a member hits a locked lesson, the surface's job is to convince them how to get access (grant / one-time / subscribe). One idea per screen: the access path. |
| Course status badge + access-model chip | Component (shared across catalog + admin) | One component family with all states. |

**Rule:** the public catalog is Explore and stays editorial/light. The admin is Operate and is DENSER — same brand, higher information density, selection-led. The paywall is Decide/Learn: sell the unlock, don't hide it.

## 2. One-Line Direction

> **"A command-grade admin deck and a gated catalog that treat access as the product."**

The admin feels like a precise operations console (navy sidebar + light dense tables + decisive actions with a visible audit trail). The public catalog keeps its editorial Explore feel and simply gets honest entitlement signals (status + access-model chips; syllabus visible, content locked). The paywall is a premium Decide/Learn moment that sells the unlock with the course's own access options — no dead end.

## 3. What Stays EXACTLY the Same (do not reinvent)

- Navy `#0B1D3A` / red `#C8102E`, category gradients, `Inter`, rounded-xl, `--surface-*` / `--ink-*` / `--border-*` / `--accent` / `--space-*` semantic system in `src/app/globals.css`
- The `/learn` Explore layout (existing PathCard/LessonCard), blog surfaces — untouched
- Dark mode: everything new must ship an `html.dark` remap, matching existing pattern
- Public blog stays fully public; guests keep the existing non-clickable-card + sign-in CTA convention

## 4. New Design Decisions

### 4.1 Course status → existing signal language (no new hue for the common states)
Status maps onto the shipped semantic signals, because statuses ARE the same semantics:
| Status | Signal | Token | What it looks like |
|---|---|---|---|
| `pending` | warn | `--signal-pending` = amber | Amber dot + pill "Pending" — not launched, admin-only |
| `live` | done | `--signal-live` = emerald | Emerald dot + pill "Live" — public, gated |
| `archived` | NEW neutral | `--signal-archived` = gray-500 | Gray pill "Archived" — retired, admin-only |
| `granted` (special access) | NEW brand rose | `--signal-granted` = rose-600 | Rose pill "Granted" — the Hermes Consultant private-access signal |

### 4.2 Access model → 5 distinct, brand-safe hues (new chips)
| Model | Hue | Token |
|---|---|---|
| `free` | sky `#0EA5E9` | `--am-free` |
| `subscription` | violet `#7C3AED` | `--am-subscription` |
| `one-time` | teal `#0D9488` | `--am-one-time` |
| `sub-or-one-time` | indigo `#4F46E5` | `--am-sub-or-one-time` |
| `granted` | rose `#E11D48` | `--am-granted` |

Chip treatment: soft tint bg (hue @ ~12%) + dark hue text on light; brighter hue on dark tint in `html.dark`. Readable mono label (e.g. `SUB OR ONE-TIME`), never full-sentence inside the chip.

### 4.3 Admin panel = Operate (the signature surface)
- **Shell:** fixed navy left sidebar (`--admin-sidebar-w: 248px`, `--surface-inverse` bg) + light dense content area. Red accent on active nav item + a red top-rule indicator (matches existing selection language).
- **Top toolbar** (`--admin-toolbar-h: 64px`): page title + primary action ("Launch", "Grant course", "+ New course") + search.
- **Tables:** checkbox column for bulk select, `--admin-row-h: 56px`, hover = `--surface-card-soft`, selected row = `--admin-selected-bg` (red @ 6%) + red left ring. Status + access-model chips inline. Mono for ids/emails/dates (`--font-mono`).
- **Primary actions** (Launch / Grant / Revoke / Save) = brand red. Destructive (Revoke / Archive) = red-dark with a confirm step. Every destructive or state-changing action writes an `admin_audit_log` row — the UI surfaces a small inline "recorded to audit log" confirmation so the trail is visible, not hidden.
- **Bulk grant flow:** select users (matrix or list) → course picker → optional grant note → confirm. One row per user on confirm.
- **Matrix view:** users × courses grid, cells show source + grant date (mono). Glanceable "what does this user have" is the whole job.
- **Audit log:** read-only, dense, mono timestamp + actor + action + target. A Monitor sub-surface within the Operate deck.

### 4.4 Paywall = Decide/Learn (the gated-course moment)
- Reuse the navy panel + red radial glow pattern (existing `.featured-glow`).
- Show a *peek* (first lesson readable) then dimmed locked rows with lock icons + "Content locked" note — honesty sells the upgrade.
- Access panel: the course's actual access options as clear rows (One-time purchase $299 / Subscribe for access / "Granted access" note when applicable), each a clean button. No dead-end 404 — always an actionable path.
- Empty state (zero content): existing "Coming soon" dashed-badge language.

## 5. Motion & Interaction Notes (for execution / steel)
- All hovers: `transition-all duration-200 ease-out` (cards `duration-300`) — matches shipped discipline.
- Status dots: no gratuitous pulse except the `live`/Featured red dot (`animate-pulse`, respects reduced-motion).
- Row selection: background + ring cross-fade 150ms; bulk-select header checkbox drives the column.
- Toasts for action success (grant/revoke/launch) — 3s auto-dismiss, red accent, stack top-right.
- Respect `prefers-reduced-motion: reduce` (already global in globals.css).
- Focus-visible red ring (already global) on all new interactive elements.

## 6. Design Tokens Draft (this task)
`design/discovery/design-tokens-course-catalog-admin.css` — additive `@theme inline` + `html.dark` remaps. Steel drops these into `globals.css` alongside existing tokens. Nothing replaces shipped tokens; 5 status/access aliases + admin/paywall tokens only.

## 7. Mood Boards (this task)
- `design/discovery/moodboards/moodboard-catalog-admin-deck.png` — admin Operate deck (navy sidebar + dense light tables + status badges + Launch)
- `design/discovery/moodboards/moodboard-gated-paywall.png` — gated Decide/Learn paywall (peek + locked rows + access options)
- `design/discovery/moodboards/moodboard-course-catalog.png` — Explore catalog grid (gradient band cards + status badges + featured navy panel)

## 8. Execution Handoff (for t_16658263)
Compose from THIS brief + the 3 mood boards + the tokens draft:
1. `mockup-admin-courses.html` (Operate — course table + status/access chips + Launch/archive + audit toast)
2. `mockup-admin-users-matrix.html` (Operate — user list + search + grant/revoke modal + bulk grant + user×course matrix)
3. `mockup-learn-catalog.html` (Explore extension — existing cards + status/entitlement badges + gated rows)
4. `mockup-paywall.html` (Decide/Learn — peek + locked rows + access options + granted note)
5. `design-system.html` + `design-tokens.css` (final) + `screenshots/*.png`
6. Wow-factor bar ≥ 4/6 (real imagery, motion, depth, typographic scale, craft, signature admin deck). Slop score ≤ 2/10.

## 9. Acceptance Criteria (for zod/QA)
1. Admin `/admin` is role-gated and reads as an Operate console, NOT a marketing dashboard (no hero, no decorative stat cards).
2. Course status maps to amber/emerald/gray/rose per §4.1; access models to the 5 hues §4.2 — same badges render in catalog and admin.
3. Pending/archived courses visible to admins only; live courses public with syllabus, content gated.
4. Non-entitled member hitting a locked lesson sees the paywall (peek + options), never lesson content, never a dead end.
5. Grant/revoke/launch/role-change actions write + visibly confirm an audit-log entry.
6. Bulk grant writes one row per selected user.
7. User-course matrix shows source + grant date at a glance.
8. All new states covered: default, hover, selected, disabled, loading, empty, error, dark mode.
9. Build passes; blog gating untouched; no `content/` changes.

## 10. Open Notes for brainiac (architect)
- Access seam `src/lib/access.ts` drives what renders: `getCatalogForUser` (status→visibility), `canAccessCourse` (model→paywall vs content), `isAdmin` (→/admin). The design assumes the paywall panel is server-rendered with the course's real access options; no client-side hiding.
- Admin tables need the exact `courses` / `user_entitlements` / `user_roles` / `subscriptions` / `admin_audit_log` field shapes to finalize columns (matrix cells = source + grant date).
- 2 open BA questions carry recommended defaults (guests = existing sign-in CTA; first `courses` row created via admin panel) — design builds to those defaults.
