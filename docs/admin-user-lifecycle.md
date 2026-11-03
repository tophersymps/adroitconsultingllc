# Admin user lifecycle management

- **Status:** IMPLEMENTED on branch `feat/admin-dashboard-ux-lifecycle` (awaiting review and merge)
- **Surface:** `/admin/users` (People), `/admin/courses`, `/admin/access/courses`, `/admin/audit`

## What admins can do

| Action | Endpoint | Audit action | Notes |
|---|---|---|---|
| Invite / create user | `POST /api/admin/users` | `user.create` | Sets role and initial course grants, sends a password-setup link. |
| Send password reset email | `POST /api/admin/users/[id]/reset-password` | `user.password_reset` | Emails a reset link to the user; the admin never sees or sets a password. |
| Freeze / unfreeze | `PATCH /api/admin/users/[id]/status` | `user.freeze`, `user.unfreeze` | Body `{ action, reason }`. Freezing revokes all active sessions. |
| Soft delete | `DELETE /api/admin/users/[id]?mode=soft` (default) | `user.delete_soft` | Tombstone with a 30-day recovery window (`007_user_tombstone.sql`). |
| Hard delete | `DELETE /api/admin/users/[id]?mode=hard` | `user.delete_hard` | Permanent. The UI requires typing `DELETE` or the user's email. |
| Restore | `POST /api/admin/users/[id]/restore` | `user.restore` | Restores a tombstoned user, optionally sends a reset link. |

Guards: an admin cannot freeze or delete their own account, and the last remaining admin cannot be
frozen or deleted.

## Enforcement

- `src/lib/session.ts` (`readSessionUser`) treats frozen or tombstoned users as signed out.
- `src/app/api/auth/login/route.ts` returns 403 with a suspension message for frozen accounts and
  revokes their sessions after credentials verify.
- Both checks degrade open if the lifecycle lookup itself fails, so a data-layer outage never
  locks everyone out.

## Data

`supabase/migrations/neon/008_user_lifecycle.sql` adds `frozen_at timestamptz` and `frozen_reason text`
to `public."user"` and updates `public.restore_tombstoned_user(uuid)`. It adds no RLS policies, so the
37-policy inventory assertion in `001_rls.sql` is unchanged. `src/lib/auth/users.ts` also ensures the
two columns exist at runtime (`ensureLifecycleColumns()`), so the feature works before the migration is
applied. Apply the migration to the Neon branch before deploying.

Only `src/lib/db/service.ts` and `src/lib/auth/users.ts` may read `DATABASE_URL`
(`src/lib/db/server-only-guard.test.ts`). Client-reachable modules must import `@/lib/auth/users`
lazily inside server-side functions.

## Related admin fixes shipped with it

- Revoking `one-time` entitlements now works (the `source = 'granted'` filter was removed from
  `DELETE /api/admin/entitlements` and `/bulk`).
- `/admin/users` and `/admin/access/courses` refresh after every mutation; `AdminToast` distinguishes
  success from error.
- `/admin/courses` lists unprovisioned disk series with one-click provisioning, manages Sections and
  Groups (`CatalogOrgDialog`), edits title and price, and deep-links to `/admin/access/courses?course=<slug>`.
- Audit log and Overview resolve user and course UUIDs to emails and titles (`auditFormat.ts`).
