/**
 * GET /api/audio/[slug]/timings — authenticated segment-timing manifest (Tier C).
 *
 * Serves the per-segment timing manifest (SegmentTiming[] — [{text, startSec,
 * endSec}, ...]) captured at generation time, enabling the player's "Follow
 * along" exact-paragraph scroll-sync. Mirror of GET /api/audio/[slug]: the
 * manifest lives in the PRIVATE Cloudflare R2 bucket and is fetched
 * server-side with the bucket-scoped R2 keys — no public or signed URL, no
 * leaked bucket key (DoD-4).
 *
 *  200  application/json: {"segments": SegmentTiming[]}  (signed-in + known
 *       slug + entry carries timingsStoragePath + object retrievable)
 *  401  unauthenticated / invalid session cookie.
 *  404  unknown slug, no timings manifest on the entry, or object missing.
 *
 * Auth: getSupabaseServerClient().auth.getUser() (HttpOnly cookie) — same
 * mechanism as the MP3 route. Fails CLOSED (any error -> 401) so a missing
 * manifest or env never leaks that the resource exists.
 */
import { NextRequest } from "next/server";
import { articleAudio } from "@/data/audio";
import { type AudioRouteContext } from "@/lib/audio/contracts";
import { getR2Object } from "@/lib/r2/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=300",
} as const;

export async function GET(req: NextRequest, context: AudioRouteContext) {
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

    // 3. No timings manifest on this entry (pre-Tier-C generation) -> 404.
    const timingsStoragePath = entry.timingsStoragePath;
    if (!timingsStoragePath) return new Response(null, { status: 404 });

    // 4. Private read via the bucket-scoped R2 credentials (server-side only).
    const object = await getR2Object(timingsStoragePath);
    if (!object) return new Response(null, { status: 404 });

    const text = new TextDecoder().decode(object.bytes);
    let segments: unknown;
    try {
      segments = JSON.parse(text);
    } catch {
      return new Response(null, { status: 404 });
    }
    // Lock the array shape so a malformed/empty manifest still 404s instead
    // of handing the player a schema-violating payload.
    if (!Array.isArray(segments)) return new Response(null, { status: 404 });

    return new Response(JSON.stringify({ segments }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch {
    // Fail closed (auth/env failure) — never leak that the manifest exists.
    return new Response(null, { status: 401 });
  }
}