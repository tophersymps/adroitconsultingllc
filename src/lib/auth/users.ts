/**
 * src/lib/auth/users.ts — admin reads of Neon Auth users (Managed Better Auth).
 *
 * Replaces `src/lib/supabase/auth-admin.ts` (GoTrue Admin API). Managed Better
 * Auth lives in OUR database, so the admin surface reads the `neon_auth."user"`
 * table directly over `DATABASE_URL` — no service-role key, no provider admin
 * endpoint, and no dependency on the caller holding a Better Auth admin role
 * (Adroit's admin gate is `user_roles`, not the auth provider's `role` column).
 *
 * SECURITY: `DATABASE_URL` is a SERVER-ONLY secret. These helpers must only be
 * called AFTER the admin gate (`requireAdminApi`) passes, and must never be
 * used to resolve "who is the current user" — that is `src/lib/session.ts`.
 *
 * Column names are Better Auth's (camelCase, quoted): "user"."email",
 * "createdAt". The table is read-only here; every write still goes through the
 * app's own public tables.
 */
import "server-only";

import { neon } from "@neondatabase/serverless";

export interface AuthUserRef {
  id: string;
  email: string;
}

type Sql = ReturnType<typeof neon>;
let cached: Sql | null = null;

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
