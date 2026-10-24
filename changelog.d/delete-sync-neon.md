### Deleting a user now deletes the user's data (delete-sync-neon)

**What** - `supabase/migrations/neon/006_delete_sync.sql` adds `public.sync_auth_user_delete()` and an
`AFTER DELETE` trigger on `neon_auth."user"` that deletes the same id from `public."user"`. The nine data
tables then CASCADE, and `admin_audit_log.actor_user_id` / `user_entitlements.granted_by` SET NULL, so the
audit trail survives de-identified.

**Why** - `002_provision_public_user.sql` installed 12 triggers on INSERT and UPDATE only. Nothing fired on
DELETE, so deleting a Managed Better Auth identity left the `public."user"` mirror row behind and the CASCADE
rules never ran. Nine such orphan rows existed on production, all created 2026-10-23, all test fixtures
(`qa-*`, `qaz*`, `ste*`, `alp*`), owning one `user_profiles` row between them and no progress data.

**Verified** - proved first inside `BEGIN ... ROLLBACK` on production, then applied for real. Live probe:
created a user with a lesson completion and read progress, deleted only the auth identity, and `public.user`,
`lesson_completion` and `read_progress` all went 1 to 0 without any statement touching `public.*`. Global
invariants after: 0 orphan mirrors, 0 unmirrored identities. The nine fixtures were exported to
`~/.hermes/backups/orphan-public-user-rows-20261024.csv` before deletion.

**Known Issues** - None. The prior nine orphans are removed, so a staff member who owned one of those
fixtures would need re-provisioning, but none held progress, entitlements or roles.
