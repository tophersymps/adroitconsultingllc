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
 * the same mechanism every other authed route uses; httpOnly enforced always,
 * secure in production (see lib/supabase/cookie-options.ts).
 *
 * Range/206: the browser's `<audio>` element issues byte-Range requests for
 * metadata and seeking, and `preload="none"` on the player means no audio bytes
 * cross the wire at all until the user presses Play.
 *
 * STREAMING (perf, t_70ecf56b): the response body is R2's own object stream,
 * piped straight through — the route never buffers the MP3, so peak server
 * memory is a chunk rather than the whole 5-15 MB file. For a Range request the
 * route resolves the span from a HeadObject (headers only) and then asks R2 for
 * EXACTLY that span, so a `bytes=0-99` metadata probe or a seek transfers the
 * requested bytes instead of the whole object.
 */
import { NextRequest } from "next/server";
import { articleAudio } from "@/data/audio";
import { type AudioRouteContext } from "@/lib/audio/contracts";
import { getR2ObjectRange, getR2ObjectStream, headR2Object } from "@/lib/r2/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "Content-Type": "audio/mpeg",
  "Cache-Control": "private, max-age=3600",
  "Accept-Ranges": "bytes",
} as const;

/**
 * A 200 carrying the whole object as a stream. Content-Length comes from R2's
 * own header; if R2 did not report one the header is omitted (chunked) rather
 * than sent as 0, which would truncate the stream.
 */
function fullBodyResponse(stream: ReadableStream<Uint8Array>, size: number): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      ...(size > 0 ? { "Content-Length": String(size) } : {}),
    },
  });
}

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

    const rangeHeader = req.headers.get("range");
    const ifRange = req.headers.get("if-range");

    // 3. Ranges we must NOT pass to R2 (so the whole object is served):
    //      - no Range header at all;
    //      - an If-Range validator we cannot confirm matches (we emit no ETag /
    //        Last-Modified, so per RFC 7233 the Range must be ignored -> 200);
    //      - a malformed / multi-range header we cannot express as one span.
    //    Each degrades to the same full 200 as before, streamed.
    const match = rangeHeader && !ifRange ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
    if (!match) {
      const whole = await getR2ObjectStream(entry.storagePath);
      if (!whole) return new Response(null, { status: 404 });
      return fullBodyResponse(whole.stream, whole.size);
    }

    // 4. A single byte range. HeadObject first: it returns the total size in
    //    headers only (no body over the wire), which keeps the span math below
    //    byte-identical to the previously buffered implementation while R2 is
    //    asked for and transfers only the requested bytes.
    const head = await headR2Object(entry.storagePath);
    if (!head) return new Response(null, { status: 404 });
    const totalSize = head.size;

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

    // Unsatisfiable range -> 416 with a Content-Range hint of the total. No
    // object bytes are fetched at all (the HEAD above already proved the
    // object exists, so a missing key is still the 404 above).
    if (start > end || start >= totalSize) {
      return new Response(null, {
        status: 416,
        headers: { ...BASE_HEADERS, "Content-Range": `bytes */${totalSize}` },
      });
    }

    // 5. Ask R2 for ONLY this span and pipe its body straight to the client.
    const span = await getR2ObjectRange(entry.storagePath, { start, end });
    if (!span) return new Response(null, { status: 404 });

    return new Response(span.stream, {
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
