# Adroit Admin — v4 Enhancement Design Brief

**Task:** t_0aa71bb6 (DESIGN) · **Designer:** kara · **Implementer:** steel · **Tenant:** adroit-blog
**Scope:** Incremental additions to the EXISTING admin platform — do NOT redesign what ships.
**Surfaces (committed):** Admin shell stays an **Operate** surface. The new dashboard landing is
**Monitor-in-Operate** (glanceable counts + audit inside the navy shell). Analytics is a compact
**Monitor** table. Launch confirm is an **Operate** dialog.

---

## 1. What to build (4 pieces)

| # | Piece | Mockup | New route / component |
|---|-------|--------|------------------------|
| 1 | Admin dashboard landing | `mockup-admin-dashboard.html` | New `/admin` landing (replaces the current courses table as the overview; courses table moves under a "Courses" nav item) |
| 2 | Per-course completion analytics | `mockup-admin-analytics.html` | New `/admin/analytics` (or tab on dashboard) |
| 3 | Admin dropdown entry | `mockup-admin-avatar-menu.html` | One new item in the existing `AvatarMenu` |
| 4 | Launch preview/confirm | `mockup-admin-launch-confirm.html` | New `LaunchDialog` component (pending → live) |

All 4 mockups live in `design/v4/`. **Build them to match the existing admin theme exactly** —
navy sidebar (`--admin-sidebar-bg`), red active rule, dense light tables, `--signal-*` /
`--am-*` / `--admin-*` tokens already in `src/app/globals.css`. The v4 tokens file only **adds**;
nothing replaces a shipped token.

---

## 2. Tokens to add (apply to src/app/globals.css)

From `design/v4/design-tokens-admin-v4.css` — add the `@theme inline` block + the `html.dark`
remap. Nothing existing changes. New semantic tokens:

- **Dashboard banner:** `--admin-banner-bg/ink/muted/border/glow/cta/cta-hover/link` — deep-navy urgency
  panel with red glow + red CTA.
- **Analytics:** `--analytics-track/bar/bar-fill/spark/good/zero` — pure-CSS bars, no chart lib.
- **Dropdown entry:** `--admin-menu-icon/tint/rule` — red shield + faint tint for the privileged item.
- **Launch dialog:** `--admin-launch-ok/warn/danger` + `--admin-dialog-shadow`.
- Utility classes: `.admin-banner`, `.admin-banner::after` (red radial glow), `.urgent-dot` +
  `@keyframes admin-pulse`, `.analytics-bar > i` (+ `.fill/.good/.zero`), `.admin-menu-item .shield`,
  `.launch-check .ok/.warn`. `prefers-reduced-motion` block already included.

---

## 3. Build notes per piece

### 3.1 Dashboard landing (`/admin`)
- **Composition:** pending-needs-launch banner on top (navy, red radial glow, pulsing dot, Launch CTA),
  then a **6-stat grid** (Live / Pending / Archived / Granted / Users / Entitlements) using the
  existing mono-uppercase statrow vocabulary, then a two-column split: **Recent admin activity** feed
  (left, ~1.55fr) + **Entitlements per course** bars (right, ~1fr).
- **Data source:** reuse the existing `useAdminCourses` / `useAdminUsers` / `useAdminAudit` hooks.
  Status counts + entitlements come from the DB, never content files.
- **Banner shows ONLY when `count(pending) > 0`**; hides when zero. Links to the launch flow.
- **Responsive:** stat grid collapses 6 → 3 → 2 cols; the two-column split stacks at ≤1240px.
- **Dark mode:** banner stays navy (unaffected); cards flip to `#111827`.

### 3.2 Completion analytics (`/admin/analytics`)
- **Composition:** 3-card summary strip (Total enrollments / Avg completion / On-track), then one card:
  inline-SVG **sparkline** (avg progress, last 8 weeks, red stroke + red gradient fill — the ONE
  allowed SVG, already written) + a **completion table** (Course / Enrolled / Avg progress bar /
  Lessons done / Signal pill).
- **Bars are pure CSS** — `.analytics-bar > i` with `width:%`. Colors: navy→red gradient fill for
  high, flat navy for mid, emerald for 100%, gray for zero-enrollment. **No chart library.**
- **Signal pill:** ≥70% = emerald "On track", 30–69% = amber "In progress", <30% / no data = gray.
- **Data source:** compute counts from existing progress + quiz tables via a NEW admin API read
  (steel to add the endpoint).

### 3.3 Admin dropdown entry (avatar menu)
- **Placement:** the `Admin console` item sits directly **after Settings**, before the theme divider,
  in the same roving-focus menuitem group.
- **Iconography:** a filled **shield** SVG in brand red; text "Admin console" bold; a red `Admin` tag
  on the right; faint red tint background (`--admin-menu-tint`). Hover brightens the tint.
- **Gating (critical):** render **ONLY** when the signed-in user is admin. Server payload exposes
  `isAdmin` derived from `user_roles`. Non-admins never see it. This is the single entry point to
  `/admin` (no top-nav link).
- Mockup has an Admin/Member toggle to demo the gating — in the real build that toggle is removed.

### 3.4 Launch preview / confirm (pending → live)
- **Entry:** a `Launch →` mini-button on pending course rows (only when status = pending).
- **2-step dialog** (`LaunchDialog`, mirror the draft-preview "seam" pattern):
  - **Step 1 — Review before launch:** rendered lesson preview with an **amber "Pending — renders
    exactly as learners will see it"** strip, then a **readiness checklist** (has title / ≥1 published
    lesson / access model set / all quizzes published). A failing check shows a warn row and **blocks**
    the Continue button.
  - **Step 2 — Confirm launch:** summary card (course, slug, status `pending → live`, access model,
    price, published lessons) + a red-outlined warning that launching makes it visible on the public
    catalog and writes an `admin_audit_log` entry. Buttons: Back / Cancel / **Launch [course]** (red).
- **On confirm:** flip the row's badge to Live in the table, close the dialog, toast
  "Launched · admin_audit_log entry recorded".
- **Server seam:** a half-finished course MUST NOT launch — enforce the readiness gate server-side
  too; the UI reflects it.

---

## 4. Handoff checklist (steel)

- [ ] Apply v4 tokens to `src/app/globals.css` (`@theme inline` + `html.dark` + utility classes).
- [ ] Add `LaunchDialog` component + wire into pending course rows.
- [ ] Add `Admin console` item to `AvatarMenu`, gated on `isAdmin` (server-derived).
- [ ] Build `/admin` landing from `mockup-admin-dashboard.html` (banner + stats + audit + snapshot).
- [ ] Add analytics (SVG sparkline + CSS bars) from `mockup-admin-analytics.html` + new admin API read.
- [ ] Audit log entry written on launch; status flipped pending → live server-side.
- [ ] Dark mode: verify each piece against the `html.dark` remap.
- [ ] Accessibility: 44px+ touch targets, aria on dialog/menuitem, `prefers-reduced-motion` honored.

**Reference deliverables:**
- `design/v4/design-tokens-admin-v4.css` — additive token + utility spec
- `design/v4/mockup-admin-dashboard.html` / `-analytics.html` / `-avatar-menu.html` / `-launch-confirm.html`
- `design/v4/shots/*-light.png` / `*-dark.png` — rendered references
- `design/v4/reports/design-system-admin-v4.html` — full design system synthesis
