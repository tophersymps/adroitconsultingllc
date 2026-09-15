/**
 * Supabase SERVICE-ROLE client — server-only, RLS-bypassing writes.
 *
 * This client is the privileged write path for quiz_run / quiz_attempt,
 * which RLS makes server-write-only (migration 006): the `authenticated`
 * role's INSERT/UPDATE/DELETE policies are revoked, so a client (anon key +
 * user JWT) can no longer forge rows via PostgREST. The service_role key
 * carries the Postgres `BYPASSRLS` attribute and writes regardless of RLS.
 *
 * SECURITY BOUNDARIES:
 *  - SUPABASE_SERVICE_ROLE_KEY is a SERVER-ONLY secret. It MUST live only in
 *    the runtime environment (Vercel production env / local .env.local) and
 *    NEVER in a NEXT_PUBLIC_* var or a tracked file.
 *  - Only use this client where a value is fully validated and recomputed
 *    server-side (see the quiz API routes). It is NOT cookie-bound, so it
 *    must never be used to resolve "who is the current user" — keep using
 *    getSupabaseServerClient() (cookies + RLS) for auth + reads.
 *  - Fails CLOSED: if the key is absent this throws, so a write can never
 *    silently degrade to a forgeable path.
 *
 * Usage: getSupabaseServiceClient()
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let client: SupabaseClient | undefined;

/**
 * Create (lazily) a service-role Supabase client for privileged server writes.
 * Throws if the service role key is missing — call inside a route's try/catch
 * so a missing key surfaces as a 500 (fail closed) rather than a forged write.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL and service role key are required");
  }
  if (!client) {
    client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
