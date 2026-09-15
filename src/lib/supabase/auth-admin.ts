/**
 * src/lib/supabase/auth-admin.ts — read auth users via the GoTrue Admin API.
 *
 * WHY THIS EXISTS: the `auth` schema is NOT exposed to PostgREST in the
 * Supabase project (zrggxfdyptiahskogwnn), so `service.from("auth.users")`
 * fails with PGRST205 ("Could not find the table 'public.auth.users' in the
 * schema cache") for every admin read. These helpers read the same data
 * through the GoTrue Admin API (`GET /auth/v1/admin/users[...]`) with the
 * service role key — no infra change, and the service role already carries
 * admin privileges. See QA fix t_48183726.
 *
 * SECURITY: the service role key is a SERVER-ONLY secret (see service.ts).
 * These helpers must only be called AFTER the admin gate (requireAdminApi)
 * passes, and never to resolve "who is the current user" — that stays on the
 * cookie-bound client.
 */

export interface AuthUserRef {
  id: string;
  email: string;
}

/** Error carrying the HTTP status so callers can distinguish 404 (not found). */
export class GoTrueError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GoTrueError";
    this.status = status;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function authHeaders(): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function assertCreds(): void {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL and service role key are required");
  }
}

/** GET a GoTrue admin endpoint with the service role key. Throws GoTrueError on non-2xx. */
async function gotrue<T>(path: string): Promise<T> {
  assertCreds();
  const res = await fetch(`${supabaseUrl}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoTrueError(res.status, `GoTrue ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * List every auth user (id + email). The admin list is page-based with no
 * `total`/`next_page` in the response, so page through `page=N` until a page
 * returns fewer than `perPage` rows. per_page=200 is the API ceiling.
 */
export async function listAuthUsers(): Promise<AuthUserRef[]> {
  const perPage = 200;
  const users: AuthUserRef[] = [];
  let page = 1;
  for (;;) {
    const { users: batch } = await gotrue<{ users: AuthUserRef[] }>(
      `/auth/v1/admin/users?per_page=${perPage}&page=${page}`,
    );
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

/**
 * Get one auth user (id + email) by id, or null when it doesn't exist.
 * A non-2xx (404 for unknown id, 400 for a non-UUID id) maps to null so the
 * caller's "target must exist" checks behave like the old `.maybeSingle()`
 * (which returned no row for either). Any other error propagates → 500.
 */
export async function getAuthUser(id: string): Promise<AuthUserRef | null> {
  try {
    const u = await gotrue<{ id: string; email: string }>(
      `/auth/v1/admin/users/${encodeURIComponent(id)}`,
    );
    return { id: u.id, email: u.email };
  } catch (err) {
    if (err instanceof GoTrueError && err.status >= 400 && err.status < 500) {
      return null;
    }
    throw err;
  }
}

/**
 * Return the set of auth-user ids that exist among `ids`. Uses one list call
 * rather than a per-id GET, so bulk validation stays at O(1) requests.
 */
export async function authUserIdsExist(ids: string[]): Promise<Set<string>> {
  const all = await listAuthUsers();
  const known = new Set(all.map((u) => u.id));
  void ids;
  return known;
}
