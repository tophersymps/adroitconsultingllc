### Real user deletions get a 30-day recovery window; QA accounts do not (user-recovery-window)

**What** - `supabase/migrations/neon/007_user_tombstone.sql` adds `deleted_at` and `is_test` to
`public."user"` and makes the auth-delete trigger branch: `is_test = true` hard-deletes the mirror row and
cascades the data away immediately; everything else is tombstoned, keeping the row and all progress, quiz,
profile and entitlement data. `public.restore_tombstoned_user(uuid)` clears a tombstone. The FKs already
support this (nine tables CASCADE from the mirror row, two audit fields SET NULL). `scripts/qa-create-test-user.cjs`
now stamps `is_test = true` so throwaway accounts are never given a window.

**Why** - 006 made identity deletion cascade immediately. Correct for test accounts, irreversible for real
ones: one mistaken delete in the Neon console destroyed a paying user's history with no path back.

**Verified** - proved inside `BEGIN ... ROLLBACK` on production before applying: a real account with a lesson
row was tombstoned with its data intact and restored successfully, then purged by the window-expiry delete; a
QA account in the same transaction was hard-deleted with its data. Applied for real, then a live check: a helper-created
account (`is_test = true`) hard-deleted on auth-identity delete with no tombstone. Production after: 37 users,
0 unmirrored identities, 0 live orphans, 0 tombstones.

**Known Issues** - The window restores a mistaken deletion; it does not merge a returning user's new signup
(new uuid) into their old data. Recreating the identity with the original uuid is the recovery path. The purge
side lives outside this repo as the `~/.hermes/scripts/tombstone-purge.py` cron.
