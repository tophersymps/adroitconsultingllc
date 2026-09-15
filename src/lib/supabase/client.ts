/**
 * Supabase client singleton for client-side (browser) use.
 * Uses the anonymous key from Next.js public env vars.
 *
 * Fails CLOSED, lazily: the env check/throw live inside getSupabaseClient(),
 * not at module import. Next.js statically renders client components that
 * import this module (e.g. PostReadProgress via useReadProgress), so a
 * module-scope throw would kill `next build` whenever env vars are absent
 * from the build environment (CI). Mirrors getSupabaseServiceClient() in
 * service.ts and getSupabaseServerClient() in server.ts. If the client is
 * actually invoked without env it throws — a misconfigured runtime fails
 * loudly, never silently.
 */
import { createClient } from "@supabase/supabase-js";

/** Singleton anonymous Supabase client. */
let client: ReturnType<typeof createClient> | undefined;

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and anon key are required");
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseKey);
  }
  return client;
}

export type SupabaseClient = ReturnType<typeof getSupabaseClient>;
