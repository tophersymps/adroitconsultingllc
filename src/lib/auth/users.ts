/**
 * src/lib/auth/users.ts — admin reads & lifecycle management of Neon Auth users
 * (Managed Better Auth).
 *
 * Replaces `src/lib/supabase/auth-admin.ts` (GoTrue Admin API). Managed Better
 * Auth lives in OUR database, so the admin surface reads and manages the
 * `neon_auth."user"` / `public."user"` tables directly over `DATABASE_URL` —
 * no service-role key, no provider admin endpoint, and no dependency on the
 * caller holding a Better Auth admin role (Adroit's admin gate is `user_roles`,
 * not the auth provider's `role` column).
 *
 * SECURITY: `DATABASE_URL` is a SERVER-ONLY secret. These helpers must only be
 * called AFTER the admin gate (`requireAdminApi`) passes (except the narrow
 * freeze/tombstone status check used by `session.ts` / `login/route.ts`), and
 * must never be used to resolve "who is the current user" — that is
 * `src/lib/session.ts`.
 */

// Build-time guard (review F-7, restored for R2-2 / SEC-R2-2-M2): these helpers
// read `DATABASE_URL`, so a Client Component import must fail the build rather
// than pull the credential path into a client bundle.
import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export interface AuthUserRef {
  id: string;
  email: string;
}

export type AdminUserAccountStatus = "active" | "frozen" | "tombstoned";

export interface AdminUserLifecycleInfo {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  provider: string;
  lastSeenAt: string | null;
  activeSessionCount: number;
  frozenAt: string | null;
  frozenReason: string | null;
  deletedAt: string | null;
  status: AdminUserAccountStatus;
}

type Sql = ReturnType<typeof neon>;
let cached: Sql | null = null;
let lifecycleSchemaEnsured = false;

function getSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for admin auth reads");
  cached ??= neon(url);
  return cached;
}

async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = getSql();
  const rows = await sql.query(text, params);
  return rows as unknown as T[];
}

/** Test seam: drop the cached driver (vitest only). */
export function __resetAuthUsersSqlForTests(): void {
  cached = null;
  lifecycleSchemaEnsured = false;
}

/**
 * Lazily ensure `frozen_at` and `frozen_reason` columns exist on `public."user"`
 * (from `supabase/migrations/neon/008_user_lifecycle.sql`) so local/preview
 * environments work seamlessly even before migration 008 is manually applied.
 */
async function ensureLifecycleColumns(): Promise<void> {
  if (lifecycleSchemaEnsured) return;
  try {
    await query(
      `ALTER TABLE public."user"
         ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
         ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
         ADD COLUMN IF NOT EXISTS frozen_reason text`,
    );
    lifecycleSchemaEnsured = true;
  } catch {
    // Non-fatal if running against a read-only replica or mocked test driver.
  }
}

/**
 * List every auth user (id + email), newest signup first.
 * The admin routes re-sort/filter in memory, matching the old GoTrue helper.
 */
export async function listAuthUsers(): Promise<AuthUserRef[]> {
  return query<AuthUserRef>(
    `SELECT id::text AS id, email
       FROM neon_auth."user"
      ORDER BY "createdAt" DESC`,
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Get one auth user (id + email) by id, or null when it doesn't exist.
 *
 * The URL segment is validated as a UUID first and bound as `uuid`
 * (`id = $1::uuid`) so the query uses the `user_pkey` Index Scan instead of
 * casting every row (`id::text = $1` → Seq Scan). A non-UUID segment is
 * "no such user" → 404, never a 22P02 cast error → 500, matching the old
 * `.maybeSingle()` / GoTrue 404 semantics. `::text` stays on OUTPUT only.
 */
export async function getAuthUser(id: string): Promise<AuthUserRef | null> {
  if (!id || !isUuid(id)) return null;
  const rows = await query<AuthUserRef>(
    `SELECT id::text AS id, email
       FROM neon_auth."user"
      WHERE id = $1::uuid
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Return the subset of `ids` that exist as auth users. One query with an array
 * bind (`id = ANY($1::uuid[])`, also an Index Scan) rather than a per-id GET.
 * Non-UUID strings cannot exist in the table, so they are dropped before the
 * bind — the answer is identical and the cast can never raise 22P02.
 */
const MAX_LOOKUP = 1000;

export async function authUserIdsExist(ids: string[]): Promise<Set<string>> {
  const unique = [
    ...new Set(
      ids.filter(
        (id) => typeof id === "string" && isUuid(id),
      ),
    ),
  ].slice(0, MAX_LOOKUP);
  if (unique.length === 0) return new Set();

  const rows = await query<{ id: string }>(
    `SELECT id::text AS id
       FROM neon_auth."user"
      WHERE id = ANY($1::uuid[])`,
    [unique],
  );
  return new Set(rows.map((r) => r.id));
}

function normalizeLifecycleRow(raw: {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
  createdAt?: string | null;
  provider?: string | null;
  lastSeenAt?: string | null;
  activeSessionCount?: number | string | null;
  frozenAt?: string | null;
  frozenReason?: string | null;
  deletedAt?: string | null;
}): AdminUserLifecycleInfo {
  const deletedAt = raw.deletedAt ?? null;
  const frozenAt = raw.frozenAt ?? null;
  const status: AdminUserAccountStatus = deletedAt
    ? "tombstoned"
    : frozenAt
      ? "frozen"
      : "active";
  return {
    id: raw.id,
    email: raw.email ?? "",
    name: raw.name ?? null,
    emailVerified: Boolean(raw.emailVerified),
    createdAt: raw.createdAt ?? null,
    provider: raw.provider || "credential",
    lastSeenAt: raw.lastSeenAt ?? null,
    activeSessionCount: Number(raw.activeSessionCount ?? 0) || 0,
    frozenAt,
    frozenReason: raw.frozenReason ?? null,
    deletedAt,
    status,
  };
}

/**
 * List enriched user lifecycle metadata for all live auth users AND any
 * soft-deleted (tombstoned) users in `public."user"` within their recovery window.
 */
export async function listAdminUserDetails(): Promise<AdminUserLifecycleInfo[]> {
  await ensureLifecycleColumns();
  const rows = await query<{
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean | null;
    createdAt: string | null;
    provider: string | null;
    lastSeenAt: string | null;
    activeSessionCount: number | string | null;
    frozenAt: string | null;
    frozenReason: string | null;
    deletedAt: string | null;
  }>(
    `SELECT
       COALESCE(a.id, p.id)::text AS id,
       COALESCE(a.email, p.email, '') AS email,
       COALESCE(NULLIF(a.name, ''), NULLIF(p.name, '')) AS name,
       COALESCE(a."emailVerified", p.emailverified, false) AS "emailVerified",
       COALESCE(a."createdAt", p.createdat)::text AS "createdAt",
       COALESCE(acct.provider, 'credential') AS provider,
       sess.last_seen_at::text AS "lastSeenAt",
       COALESCE(sess.active_count, 0)::int AS "activeSessionCount",
       p.frozen_at::text AS "frozenAt",
       p.frozen_reason AS "frozenReason",
       CASE WHEN a.id IS NULL THEN p.deleted_at::text ELSE NULL END AS "deletedAt"
     FROM neon_auth."user" a
     FULL OUTER JOIN public."user" p ON p.id = a.id
     LEFT JOIN LATERAL (
       SELECT acc."providerId" AS provider
         FROM neon_auth.account acc
        WHERE acc."userId" = COALESCE(a.id, p.id)
        ORDER BY acc."createdAt" ASC
        LIMIT 1
     ) acct ON true
     LEFT JOIN LATERAL (
       SELECT
         MAX(GREATEST(s."updatedAt", s."createdAt")) AS last_seen_at,
         COUNT(*) FILTER (WHERE s."expiresAt" > now()) AS active_count
         FROM neon_auth.session s
        WHERE s."userId" = COALESCE(a.id, p.id)
     ) sess ON true
     WHERE a.id IS NOT NULL OR p.deleted_at IS NOT NULL
     ORDER BY COALESCE(a."createdAt", p.createdat) DESC NULLS LAST`,
  );
  return rows.map(normalizeLifecycleRow);
}

/**
 * Read enriched lifecycle detail for a single user (live or tombstoned).
 */
export async function getAdminUserDetail(
  id: string,
): Promise<AdminUserLifecycleInfo | null> {
  if (!id || !isUuid(id)) return null;
  await ensureLifecycleColumns();
  const rows = await query<{
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean | null;
    createdAt: string | null;
    provider: string | null;
    lastSeenAt: string | null;
    activeSessionCount: number | string | null;
    frozenAt: string | null;
    frozenReason: string | null;
    deletedAt: string | null;
  }>(
    `SELECT
       COALESCE(a.id, p.id)::text AS id,
       COALESCE(a.email, p.email, '') AS email,
       COALESCE(NULLIF(a.name, ''), NULLIF(p.name, '')) AS name,
       COALESCE(a."emailVerified", p.emailverified, false) AS "emailVerified",
       COALESCE(a."createdAt", p.createdat)::text AS "createdAt",
       COALESCE(acct.provider, 'credential') AS provider,
       sess.last_seen_at::text AS "lastSeenAt",
       COALESCE(sess.active_count, 0)::int AS "activeSessionCount",
       p.frozen_at::text AS "frozenAt",
       p.frozen_reason AS "frozenReason",
       CASE WHEN a.id IS NULL THEN p.deleted_at::text ELSE NULL END AS "deletedAt"
     FROM neon_auth."user" a
     FULL OUTER JOIN public."user" p ON p.id = a.id
     LEFT JOIN LATERAL (
       SELECT acc."providerId" AS provider
         FROM neon_auth.account acc
        WHERE acc."userId" = COALESCE(a.id, p.id)
        ORDER BY acc."createdAt" ASC
        LIMIT 1
     ) acct ON true
     LEFT JOIN LATERAL (
       SELECT
         MAX(GREATEST(s."updatedAt", s."createdAt")) AS last_seen_at,
         COUNT(*) FILTER (WHERE s."expiresAt" > now()) AS active_count
         FROM neon_auth.session s
        WHERE s."userId" = COALESCE(a.id, p.id)
     ) sess ON true
     WHERE COALESCE(a.id, p.id) = $1::uuid
     LIMIT 1`,
    [id],
  );
  return rows[0] ? normalizeLifecycleRow(rows[0]) : null;
}

/**
 * Lightweight check used by session & login routes to verify whether a user
 * is currently frozen or soft-deleted. Fails open if DATABASE_URL is absent in
 * unit test environments.
 */
export async function getUserAccountBlockState(
  userId: string,
): Promise<{ blocked: boolean; reason: "frozen" | "tombstoned" | null; frozenReason: string | null }> {
  if (!userId || !isUuid(userId) || !process.env.DATABASE_URL) {
    return { blocked: false, reason: null, frozenReason: null };
  }
  try {
    await ensureLifecycleColumns();
    const rows = await query<{
      frozen_at: string | null;
      frozen_reason: string | null;
      deleted_at: string | null;
    }>(
      `SELECT frozen_at::text AS frozen_at,
              frozen_reason,
              deleted_at::text AS deleted_at
         FROM public."user"
        WHERE id = $1::uuid
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return { blocked: false, reason: null, frozenReason: null };
    if (row.deleted_at) {
      return { blocked: true, reason: "tombstoned", frozenReason: null };
    }
    if (row.frozen_at) {
      return { blocked: true, reason: "frozen", frozenReason: row.frozen_reason ?? null };
    }
    return { blocked: false, reason: null, frozenReason: null };
  } catch {
    return { blocked: false, reason: null, frozenReason: null };
  }
}

/**
 * Check by email if an account is currently frozen before allowing sign-in.
 */
export async function getUserBlockStateByEmail(
  email: string,
): Promise<{ userId: string; blocked: boolean; reason: "frozen" | "tombstoned" | null; frozenReason: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !process.env.DATABASE_URL) return null;
  try {
    await ensureLifecycleColumns();
    const rows = await query<{
      id: string;
      frozen_at: string | null;
      frozen_reason: string | null;
      deleted_at: string | null;
      has_auth: boolean;
    }>(
      `SELECT p.id::text AS id,
              p.frozen_at::text AS frozen_at,
              p.frozen_reason,
              p.deleted_at::text AS deleted_at,
              (a.id IS NOT NULL) AS has_auth
         FROM public."user" p
         LEFT JOIN neon_auth."user" a ON a.id = p.id
        WHERE lower(p.email) = $1
        ORDER BY p.deleted_at NULLS FIRST, p.createdat DESC NULLS LAST
        LIMIT 1`,
      [normalized],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.deleted_at && !row.has_auth) {
      return { userId: row.id, blocked: true, reason: "tombstoned", frozenReason: null };
    }
    if (row.frozen_at) {
      return { userId: row.id, blocked: true, reason: "frozen", frozenReason: row.frozen_reason ?? null };
    }
    return { userId: row.id, blocked: false, reason: null, frozenReason: null };
  } catch {
    return null;
  }
}

/**
 * Revoke all active sessions for a user in `neon_auth.session`.
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  if (!userId || !isUuid(userId)) return 0;
  const rows = await query<{ id: string }>(
    `DELETE FROM neon_auth.session
      WHERE "userId" = $1::uuid
      RETURNING id::text AS id`,
    [userId],
  );
  return rows.length;
}

/**
 * Freeze or unfreeze a user account. Freezing stamps `frozen_at = now()` on
 * `public."user"` and immediately revokes all active sessions in `neon_auth.session`.
 */
export async function setUserFrozenState(
  userId: string,
  opts: { frozen: boolean; reason?: string | null },
): Promise<{
  frozenAt: string | null;
  frozenReason: string | null;
  revokedSessions: number;
}> {
  if (!userId || !isUuid(userId)) {
    throw new Error("Invalid user ID");
  }
  await ensureLifecycleColumns();

  // Ensure public."user" mirror row exists for live auth user before updating
  await query(
    `INSERT INTO public."user" (id, name, email, emailverified, createdat, updatedat)
     SELECT a.id, COALESCE(NULLIF(a.name, ''), split_part(a.email, '@', 1)), a.email, a."emailVerified", a."createdAt", now()
       FROM neon_auth."user" a
      WHERE a.id = $1::uuid
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );

  const reason = opts.frozen ? (opts.reason?.trim() || null) : null;
  const updated = await query<{ frozen_at: string | null; frozen_reason: string | null }>(
    opts.frozen
      ? `UPDATE public."user"
            SET frozen_at = COALESCE(frozen_at, now()),
                frozen_reason = $2,
                updatedat = now()
          WHERE id = $1::uuid
          RETURNING frozen_at::text AS frozen_at, frozen_reason`
      : `UPDATE public."user"
            SET frozen_at = NULL,
                frozen_reason = NULL,
                updatedat = now()
          WHERE id = $1::uuid
          RETURNING frozen_at::text AS frozen_at, frozen_reason`,
    opts.frozen ? [userId, reason] : [userId],
  );

  const revokedSessions = opts.frozen ? await revokeUserSessions(userId) : 0;
  return {
    frozenAt: updated[0]?.frozen_at ?? null,
    frozenReason: updated[0]?.frozen_reason ?? null,
    revokedSessions,
  };
}

/**
 * Create a new user identity in `neon_auth."user"` + unusable scrypt credential
 * in `neon_auth.account` so the user can be invited/provisioned by an admin
 * without hijacking the admin's own session cookies, and can set their password
 * via password reset link.
 */
export async function createAuthUserIdentity(input: {
  email: string;
  name?: string | null;
}): Promise<{ id: string; email: string; name: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required");
  }
  const displayName = (input.name?.trim() || email.split("@")[0] || "Member").slice(0, 120);

  await ensureLifecycleColumns();

  // Check if email already exists in neon_auth."user"
  const existingAuth = await query<{ id: string; email: string }>(
    `SELECT id::text AS id, email
       FROM neon_auth."user"
      WHERE lower(email) = $1
      LIMIT 1`,
    [email],
  );
  if (existingAuth.length > 0) {
    const err = new Error("A user with this email already exists.");
    (err as Error & { code?: string }).code = "USER_EXISTS";
    throw err;
  }

  // Check if email belongs to a tombstoned user in public."user"
  const existingTombstone = await query<{ id: string }>(
    `SELECT id::text AS id
       FROM public."user"
      WHERE lower(email) = $1 AND deleted_at IS NOT NULL
      LIMIT 1`,
    [email],
  );
  if (existingTombstone.length > 0) {
    const err = new Error(
      "This email belongs to a recently deleted account in the 30-day recovery window. Restore the deleted account instead.",
    );
    (err as Error & { code?: string; tombstoneUserId?: string }).code = "USER_TOMBSTONED";
    (err as Error & { tombstoneUserId?: string }).tombstoneUserId = existingTombstone[0].id;
    throw err;
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  const unusableHash = `${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`;

  await query(
    `INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3, true, now(), now())`,
    [userId, displayName, email],
  );

  await query(
    `INSERT INTO neon_auth.account (
       id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
     )
     VALUES ($1::uuid, $2, 'credential', $3::uuid, $4, now(), now())`,
    [accountId, userId, userId, unusableHash],
  );

  // Ensure public."user", user_roles, and user_profiles exist even if the DB trigger is not active
  await query(
    `INSERT INTO public."user" (id, name, email, emailverified, createdat, updatedat)
     VALUES ($1::uuid, $2, $3, true, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           email = EXCLUDED.email,
           emailverified = true,
           deleted_at = NULL,
           updatedat = now()`,
    [userId, displayName, email],
  );

  return { id: userId, email, name: displayName };
}

/**
 * Soft-delete a user: removes their `neon_auth` identity and active sessions
 * while preserving their `public."user"` row (with `deleted_at = now()`) and
 * all 9 domain tables (progress, entitlements, roles, profile) for 30 days.
 */
export async function softDeleteAuthUser(
  userId: string,
): Promise<{ id: string; email: string; deletedAt: string } | null> {
  if (!userId || !isUuid(userId)) return null;
  await ensureLifecycleColumns();

  const authRows = await query<{ id: string; email: string; name: string | null }>(
    `SELECT id::text AS id, email, name
       FROM neon_auth."user"
      WHERE id = $1::uuid
      LIMIT 1`,
    [userId],
  );
  const authUser = authRows[0];
  if (!authUser) return null;

  // Ensure public."user" has is_test = false and up-to-date email/name snapshot before deleting auth row
  await query(
    `INSERT INTO public."user" (id, name, email, emailverified, is_test, createdat, updatedat)
     VALUES ($1::uuid, $2, $3, true, false, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name = COALESCE(NULLIF(EXCLUDED.name, ''), public."user".name),
           is_test = false,
           updatedat = now()`,
    [userId, authUser.name || authUser.email.split("@")[0], authUser.email],
  );

  await query(`DELETE FROM neon_auth.session WHERE "userId" = $1::uuid`, [userId]);
  await query(`DELETE FROM neon_auth.account WHERE "userId" = $1::uuid`, [userId]);
  await query(`DELETE FROM neon_auth."user" WHERE id = $1::uuid`, [userId]);

  // Explicitly ensure deleted_at is stamped (idempotent with 007_user_tombstone.sql trigger)
  const stamped = await query<{ deleted_at: string }>(
    `UPDATE public."user"
        SET deleted_at = COALESCE(deleted_at, now()),
            updatedat = now()
      WHERE id = $1::uuid
      RETURNING deleted_at::text AS deleted_at`,
    [userId],
  );

  return {
    id: userId,
    email: authUser.email,
    deletedAt: stamped[0]?.deleted_at ?? new Date().toISOString(),
  };
}

/**
 * Restore a soft-deleted (tombstoned) user by recreating their `neon_auth."user"`
 * identity with the ORIGINAL UUID + unusable credential row and clearing `deleted_at`.
 */
export async function restoreTombstonedAuthUser(
  userId: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  if (!userId || !isUuid(userId)) return null;
  await ensureLifecycleColumns();

  const pubRows = await query<{
    id: string;
    email: string | null;
    name: string | null;
    deleted_at: string | null;
  }>(
    `SELECT id::text AS id, email, name, deleted_at::text AS deleted_at
       FROM public."user"
      WHERE id = $1::uuid
      LIMIT 1`,
    [userId],
  );
  const pubUser = pubRows[0];
  if (!pubUser || !pubUser.email) return null;

  const displayName = pubUser.name || pubUser.email.split("@")[0] || "Member";
  const unusableHash = `${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`;

  await query(
    `INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3, true, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           "emailVerified" = true,
           "updatedAt" = now()`,
    [userId, displayName, pubUser.email],
  );

  // Ensure a credential account row exists so Better Auth password-reset works
  const existingAcc = await query<{ id: string }>(
    `SELECT id::text AS id
       FROM neon_auth.account
      WHERE "userId" = $1::uuid AND "providerId" = 'credential'
      LIMIT 1`,
    [userId],
  );
  if (existingAcc.length === 0) {
    await query(
      `INSERT INTO neon_auth.account (
         id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
       )
       VALUES ($1::uuid, $2, 'credential', $3::uuid, $4, now(), now())`,
      [randomUUID(), userId, userId, unusableHash],
    );
  }

  await query(
    `UPDATE public."user"
        SET deleted_at = NULL,
            frozen_at = NULL,
            frozen_reason = NULL,
            updatedat = now()
      WHERE id = $1::uuid`,
    [userId],
  );

  return {
    id: userId,
    email: pubUser.email,
    name: displayName,
  };
}

/**
 * Permanently hard-delete a user (both live and tombstoned): removes their
 * `neon_auth` rows and deletes `public."user"` (cascading across all 9 user
 * tables while `admin_audit_log` entries are anonymized via trigger).
 */
export async function hardDeleteAuthUser(
  userId: string,
): Promise<{ id: string; email: string } | null> {
  if (!userId || !isUuid(userId)) return null;
  await ensureLifecycleColumns();

  const existing = await query<{ id: string; email: string }>(
    `SELECT COALESCE(a.id, p.id)::text AS id,
            COALESCE(a.email, p.email, '') AS email
       FROM neon_auth."user" a
       FULL OUTER JOIN public."user" p ON p.id = a.id
      WHERE COALESCE(a.id, p.id) = $1::uuid
      LIMIT 1`,
    [userId],
  );
  const target = existing[0];
  if (!target) return null;

  await query(
    `UPDATE public."user" SET is_test = true WHERE id = $1::uuid`,
    [userId],
  );
  await query(`DELETE FROM neon_auth.session WHERE "userId" = $1::uuid`, [userId]);
  await query(`DELETE FROM neon_auth.account WHERE "userId" = $1::uuid`, [userId]);
  await query(`DELETE FROM neon_auth."user" WHERE id = $1::uuid`, [userId]);
  await query(`DELETE FROM public."user" WHERE id = $1::uuid`, [userId]);

  return {
    id: userId,
    email: target.email,
  };
}
