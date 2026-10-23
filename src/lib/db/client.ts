/**
 * src/lib/db/client.ts — Neon Data API client singleton for the browser
 * (Phase 3 of the Neon migration, R2-2). Replaces `src/lib/supabase/client.ts`.
 *
 * WHY A TOKEN PROVIDER INSTEAD OF neon-js's BUILT-IN AUTH CLIENT: the Managed
 * Better Auth session cookie is `httpOnly` (CWE-1004 hardening kept from the
 * Supabase era), so browser JavaScript cannot read it to mint a JWT itself.
 * The supported neon-js form for that case is `dataApi.getToken` — "wire this
 * to your own identity provider" — so the token comes from our own
 * same-origin `GET /api/db/token`, which forwards the httpOnly cookie to Neon
 * Auth *server-side*. Every Data API request then carries the caller's own
 * JWT, and RLS (not this module) decides what the row set is.
 *
 * The query surface is unchanged (`.from().select().eq()` / `{data,error}`):
 * neon-js wraps the same PostgREST client.
 *
 * `.auth.getUser()` is a compatibility seam over `GET /api/auth/session` —
 * same source of truth as before, minus the Supabase SDK. R2-1 re-points the
 * remaining call sites at the session hook; until then they keep working.
 *
 * Fails CLOSED, lazily: the env check/throw lives inside getSupabaseClient(),
 * not at module import, so `next build` can statically render client
 * components that import this module on a build host without env.
 */
import { createClient } from "@neondatabase/neon-js";

import { getToken, invalidateDbToken } from "./token-cache";

/**
 * The token cache lives in ./token-cache so that identity-change call sites
 * (Header, login page, useAuth) can reset it without importing the Neon SDK.
 * Re-exported here so `./client` stays a valid import surface for existing
 * call sites and tests.
 */
export { getToken, invalidateDbToken };
export { resetDbTokenCache } from "./token-cache";


export interface DbBrowserUser {
  id: string;
  email: string;
}

export type DbBrowserClient = ReturnType<typeof createClient> & {
  auth: {
    getUser: () => Promise<{ data: { user: DbBrowserUser | null }; error: Error | null }>;
  };
};

/**
 * Data API fetch wrapper: a 401 means the JWT we just sent is no longer
 * accepted (revoked session, rotated signing key). Drop the cache so the next
 * request re-reads `/api/db/token` instead of replaying the dead token for the
 * rest of the TTL. The failing request is NOT retried — a write rejected for
 * auth did not happen server-side, but a blind replay from a fetch wrapper
 * would double-submit it once the cache refills.
 */
const dataApiFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status === 401) invalidateDbToken();
  return response;
};

let client: DbBrowserClient | undefined;

/** Singleton browser Data API client. Throws when the public env is absent. */
export function getSupabaseClient(): DbBrowserClient {
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!dataApiUrl) {
    throw new Error("NEXT_PUBLIC_NEON_DATA_API_URL is required");
  }

  if (!client) {
    const db = createClient({
      dataApi: {
        url: dataApiUrl,
        getToken,
        // 401 -> drop the cached JWT (SEC-R2-2-M3(c)).
        options: { global: { fetch: dataApiFetch } },
      },
    }) as DbBrowserClient;

    db.auth = {
      getUser: async () => {
        try {
          const res = await fetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (!res.ok) return { data: { user: null }, error: null };
          const body = (await res.json().catch(() => null)) as
            | { user?: { id?: string; email?: string } | null }
            | null;
          const user = body?.user;
          return {
            data: {
              user: user?.id ? { id: user.id, email: user.email ?? "" } : null,
            },
            error: null,
          };
        } catch (error) {
          return { data: { user: null }, error: error as Error };
        }
      },
    };

    client = db;
  }
  return client;
}

export type SupabaseClient = DbBrowserClient;
