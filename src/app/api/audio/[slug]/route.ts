/**
 * GET /api/audio/[slug] — authenticated private stream (plan Phase 5A).
 *
 * Serves a narrated article MP3 ONLY to signed-in users, streaming the blob
 * from the PRIVATE Cloudflare R2 bucket ('adroit-audio') over its S3 API.
 * Never emits a public or signed URL — the object is fetched server-side with
 * the bucket-scoped R2 keys (src/lib/r2/client.ts) and returned as fixed
 * `audio/mpeg` bytes.
 *
 *  200  audio/mpeg, "Cache-Control: private, max-age=3600"  (full body)
 *  206  Partial Content when an HTTP Range header is honored (single byte
 *       range), with Content-Range + Accept-Ranges: bytes.
 *       A Range request only returns 206 when the resource still matches
 *       (If-Range handling); otherwise it degrades to a full 200.
 *  401  unauthenticated / invalid session cookie.
 *  404  unknown slug (not in articleAudio) OR private object missing.
 *  416  Range start beyond the end of the file (unsatisfiable).
 *
 * Auth: getSupabaseServerClient().auth.getUser() from the HttpOnly cookie —
 * the same mechanism every other authed route uses.
 *
 * Range/206: the browser's `<audio>` element issues byte-Range requests for
 * metadata and seeking. Serving a partial 206 avoids transferring the whole
 * 1-3MB file before playback, and `preload="none"` on the player means no
 * audio bytes cross the wire at all until the user presses Play.
 */
import { NextRequest } from "next/server";
import { articleAudio } from "@/data/audio";
import { type AudioRouteContext } from "@/lib/audio/contracts";
import { getR2Object } from "@/lib/r2/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "Content-Type": "audio/mpeg",
  "Cache-Control": "private, max-age=3600",
  "Accept-Ranges": "bytes",
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

    // 3. Private read via the bucket-scoped R2 credentials. The object stays
    //    server-side; the key is never returned to the client and no URL
    //    (public or signed) is ever minted.
    const object = await getR2Object(entry.storagePath);
    if (!object) return new Response(null, { status: 404 });

    const body = object.bytes;
    const totalSize = object.size;
    const rangeHeader = req.headers.get("range");
    const ifRange = req.headers.get("if-range");

    // Serve the whole file only when there is no Range, or the caller supplied
    // an If-Range validator we cannot confirm matches (we emit no ETag /
    // Last-Modified, so per RFC 7233 the Range must be ignored -> full 200).
    // This is the cheap, correct If-Range fallback for a streamed resource.
    if (!rangeHeader || ifRange) {
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { ...BASE_HEADERS, "Content-Length": String(totalSize) },
      });
    }

    // Parse a single byte range: bytes=start-end | bytes=start- | bytes=-suffix.
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      // Malformed / multi-range (unsupported) -> degrade to full 200.
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { ...BASE_HEADERS, "Content-Length": String(totalSize) },
      });
    }

    const startRaw = match[1] === "" ? undefined : parseInt(match[1], 10);
    const endRaw = match[2] === "" ? undefined : parseInt(match[2], 10);

    let start: number;
    let end: number;
    if (startRaw === undefined) {
      // Suffix range: bytes=-N  (last N bytes).
      const suffix = endRaw ?? 0;
      start = Math.max(totalSize - suffix, 0);
      end = totalSize - 1;
    } else {
      start = startRaw;
      end = endRaw === undefined ? totalSize - 1 : Math.min(endRaw, totalSize - 1);
    }

    // Unsatisfiable range -> 416 with a Content-Range hint of the total.
    if (start > end || start >= totalSize) {
      return new Response(null, {
        status: 416,
        headers: { ...BASE_HEADERS, "Content-Range": `bytes */${totalSize}` },
      });
    }

    const partial = body.subarray(start, end + 1);
    return new Response(new Uint8Array(partial), {
      status: 206,
      headers: {
        ...BASE_HEADERS,
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Content-Length": String(end - start + 1),
      },
    });
  } catch {
    // Fail closed: an auth/env failure must never emit a public URL or a
    // partial stream. Surface as 401 (no session) — the default 500 would
    // leak that the resource exists; 401 keeps the gate opaque.
    return new Response(null, { status: 401 });
  }
}