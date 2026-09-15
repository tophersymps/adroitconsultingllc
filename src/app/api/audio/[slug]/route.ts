/**
 * GET /api/audio/[slug] — authenticated private stream (plan Phase 5A).
 *
 * Serves a narrated article MP3 ONLY to signed-in users, streaming the blob
 * from the PRIVATE Supabase 'audio' bucket. Never emits a public URL — the
 * object is fetched server-side with the service-role client and returned as
 * fixed `audio/mpeg` bytes.
 *
 *  200  audio/mpeg, "Cache-Control: private, max-age=3600"
 *       signed-in + slug present in articleAudio + object retrievable.
 *  401  unauthenticated / invalid session cookie.
 *  404  unknown slug (not in articleAudio) OR private object missing.
 *
 * Auth: getSupabaseServerClient().auth.getUser() from the HttpOnly cookie —
 * the same mechanism every other authed route uses.
 */
import { NextRequest } from "next/server";
import { articleAudio } from "@/data/audio";
import { AUDIO_BUCKET, type AudioRouteContext } from "@/lib/audio/contracts";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: AudioRouteContext) {
  try {
    const { slug } = await context.params;

    // 1. Auth gate: no valid session cookie -> 401.
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response(null, { status: 401 });

    // 2. Unknown slug -> 404.
    const entry = articleAudio.find((a) => a.slug === slug);
    if (!entry) return new Response(null, { status: 404 });

    // 3. Private read via service-role client (server can read private blobs).
    const { data, error } = await getSupabaseServiceClient()
      .storage.from(AUDIO_BUCKET)
      .download(entry.storagePath);

    if (error || !data) return new Response(null, { status: 404 });

    const buf = Buffer.from(await data.arrayBuffer());
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch {
    // Fail closed: an auth/env failure must never emit a public URL or a
    // partial stream. Surface as 401 (no session) — the default 500 would
    // leak that the resource exists; 401 keeps the gate opaque.
    return new Response(null, { status: 401 });
  }
}