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
 * One in-flight token request per page is enough; cache it briefly.
 *
 * The cache is NOT identity-aware: a 60 s TTL on a guest `null` would keep the
 * client unauthenticated for up to a minute after sign-in, and a 60 s TTL on a
 * user JWT would keep sending it for up to a minute after sign-out. Both
 * transitions therefore call invalidateDbToken() (login page + Header sign-out)
 * so the next Data API request re-reads /api/db/token with the new cookie. The
 * TTL only bounds ordinary staleness (session refresh), not identity changes.
 */
let tokenPromise: Promise<string | null> | null = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 60_000;

/** Drop the cached token so the next request re-reads the session cookie. */
export function invalidateDbToken(): void {
  tokenPromise = null;
  tokenFetchedAt = 0;
}

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenPromise && now - tokenFetchedAt < TOKEN_TTL_MS) return tokenPromise;

  tokenFetchedAt = now;
  tokenPromise = fetch("/api/db/token", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
      return typeof body?.token === "string" && body.token.length > 0
        ? body.token
        : null;
    })
    .catch(() => null);

  return tokenPromise;
}

let client: DbBrowserClient | undefined;

/** Singleton browser Data API client. Throws when the public env is absent. */
export function getSupabaseClient(): DbBrowserClient {
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!dataApiUrl) {
    throw new Error("NEXT_PUBLIC_NEON_DATA_API_URL is required");
  }

  if (!client) {
    const db = createClient({
      dataApi: { url: dataApiUrl, getToken },
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
