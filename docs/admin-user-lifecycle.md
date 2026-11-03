# Admin User Lifecycle & Course Hub Management

- **Status:** IMPLEMENTED & MERGED to `main` (PR #445, PR #447)
- **Surfaces:**
  - `/admin/users` (People & Lifecycle Management)
  - `/admin/courses` (Unified Course Administration Hub)
  - `/admin/audit` (Audit Log)
  - `/admin` (Access Overview & Governance Health)
  - `/admin/access/courses` (Redirects to `/admin/courses?tab=roster`)

---

## 1. Single User Lifecycle Actions

| Action | Endpoint | Audit action | Notes |
|---|---|---|---|
| Invite / create user | `POST /api/admin/users` | `user.create` | Sets role and initial course grants, sends a password-setup link. |
| Send password reset email | `POST /api/admin/users/[id]/reset-password` | `user.password_reset` | Emails a reset link to the user; the admin never sees or sets a password. |
| Freeze / unfreeze | `PATCH /api/admin/users/[id]/status` | `user.freeze`, `user.unfreeze` | Body `{ action, reason }`. Freezing revokes all active sessions. |
| Soft delete | `DELETE /api/admin/users/[id]?mode=soft` (default) | `user.delete_soft` | Tombstone with a 30-day recovery window (`007_user_tombstone.sql`). |
| Hard delete | `DELETE /api/admin/users/[id]?mode=hard` | `user.delete_hard` | Permanent. The UI requires typing `DELETE` or the user's email. |
| Restore | `POST /api/admin/users/[id]/restore` | `user.restore` | Restores a tombstoned user, optionally sends a reset link. |
| Update role | `PATCH /api/admin/users/[id]/role` | `user.role_change` | Assigns `member` or `admin` role. |

**Guards:** An admin cannot freeze, delete, or demote their own account. The last remaining admin cannot be frozen, deleted, or demoted.

---

## 2. Bulk User Operations

Administrators can execute operations on multiple selected users simultaneously via `POST /api/admin/users/bulk`.

### Supported Bulk Actions

| Action | Payload `action` | Required Fields | Audit Action | Notes |
|---|---|---|---|---|
| Batch Freeze | `"freeze"` | `reason?` | `user.bulk_freeze` / `user.freeze` | Suspends accounts, revokes active sessions. Skips actor. |
| Batch Unfreeze | `"unfreeze"` | — | `user.bulk_unfreeze` / `user.unfreeze` | Restores account access. |
| Batch Password Reset | `"reset-password"` | — | `user.bulk_password_reset` / `user.password_reset` | Sends password-reset emails to all target users. |
| Bulk Soft Delete | `"soft-delete"` | — | `user.bulk_soft_delete` / `user.delete_soft` | Sets 30-day tombstone. Skips actor and last-admin. |
| Bulk Hard Delete | `"hard-delete"` | — | `user.bulk_hard_delete` / `user.delete_hard` | Permanently deletes user records. Skips actor and last-admin. |
| Batch Role Change | `"role"` | `role: "admin" \| "member"` | `user.bulk_role_change` / `user.role_change` | Updates system role. Protects against last-admin demotion. |
| Bulk Grant Course | `"grant-course"` | `courseId` | `entitlement.bulk_grant` | Grants access to the specified course for selected users. |
| Bulk Revoke Course | `"revoke-course"` | `courseId` | `entitlement.bulk_revoke` | Revokes course entitlements for selected users. |

### Bulk Safety Protections
- **Self-Lockout Prevention:** Any bulk request containing the acting admin's ID will skip the actor for destructive actions (`freeze`, `soft-delete`, `hard-delete`, `role demotion`).
- **Last-Admin Safeguard:** The endpoint counts current non-deleted admins. If a requested operation would demote or delete all active admins, it is rejected with a 400 Bad Request error.
- **Granular Audit Logs:** Each targeted user receives an individual audit row in the audit log in addition to the batch-level event.

---

## 3. UI Architecture & Responsiveness

### People Surface (`/admin/users`)
- **Multi-Select & Floating Action Pill:** Multi-select checkboxes on learner rows and master select-all trigger a floating action bar with one-click dialogs (`BulkGrantCourseDialog`, `BulkFreezeDialog`, `BulkDeleteDialog`, `BulkResetPasswordDialog`).
- **Tabbed Detail View:** De-cluttered user details organized into three sub-tabs:
  - 🎓 **Course Entitlements:** Effective access status across grants, one-time passes, and subscriptions with inline course search filter.
  - 👤 **Account & Identity:** Auth provider, email verification status, joined date, and last active sessions.
  - 💳 **Subscriptions:** Active subscription state, derived access, and plan status.
- **Mobile/Tablet Master-Detail Switcher:** On viewports below `xl`, the screen renders a single column: tapping any user slides into the detail view with a `< Back to People List` header. On `xl+`, renders the classic dual-pane layout.

### Unified Course Hub (`/admin/courses`)
Merged previously separate `/admin/access/courses` (roster) and `/admin/courses` (catalog) into a unified hub with four sub-tabs:
1. 📋 **Catalog & Pricing:**
   - Course status (`live`, `pending`, `archived`) and access model (`free`, `subscription`, `one-time`, `sub-or-one-time`, `granted`).
   - Price display in USD.
   - Unprovisioned disk series discovery banner with 1-click provisioning.
   - **View Mode Switcher:** Toggle between responsive **Cards View** (`[ ▦ Cards ]`) and streamlined **Data Table** (`[ ☰ Table ]`).
2. 👥 **Student Rosters & Access:**
   - Single-course selector pill bar.
   - Inline access model selector with instant seam re-resolution.
   - Learner roster with multi-select checkboxes, search, and bulk grant/revoke.
3. 🗂️ **Sections & Libraries:**
   - Visual card layout representing curriculum sections, child groups, and associated course tracks.
   - Direct launcher for `CatalogOrgDialog`.
4. 📊 **Access Matrix:**
   - Dedicated full-width 2D cross-product grid (`AccessGrid`) rendering active users against live courses with click-to-act effective access cells.

### Sidebar Navigation (`AdminShell`)
Navigation organized into 6 focused links:
- **Access:** Overview (`/admin`), People (`/admin/users`), Courses (`/admin/courses`)
- **System:** Analytics (`/admin/analytics`), Audit Log (`/admin/audit`), Offers · Coupons (`/admin/offers`)

---

## 4. Enforcement & Session Integration

- `src/lib/session.ts` (`readSessionUser`) treats frozen or tombstoned users as signed out.
- `src/app/api/auth/login/route.ts` returns 403 with a suspension message for frozen accounts and revokes their sessions after credentials verify.
- Both checks degrade open if the lifecycle lookup itself fails, ensuring a data-layer outage never locks out valid users.

---

## 5. Database Schema & Columns

- `supabase/migrations/neon/008_user_lifecycle.sql` adds `frozen_at timestamptz` and `frozen_reason text` to `public."user"` and updates `public.restore_tombstoned_user(uuid)`.
- `src/lib/auth/users.ts` ensures the columns exist at runtime (`ensureLifecycleColumns()`).
- Only `src/lib/db/service.ts` and `src/lib/auth/users.ts` may read `DATABASE_URL` (`src/lib/db/server-only-guard.test.ts`). Client-reachable modules import `@/lib/auth/users` lazily inside server-side functions.
