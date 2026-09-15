/**
 * POST /api/progress/read — mark content as read.
 * DELETE /api/progress/read — unmark content as read (removes the row).
 *
 * Upserts a read_progress row in Supabase for authenticated users.
 * Silently fails if no auth or Supabase is unavailable (client keeps
 * localStorage as the fallback).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { denyLessonNotAccessible } from "@/lib/access-gate";
import { appendCompletionEvent } from "@/lib/completion";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
  sanitiseDbError,
  validateSlug,
} from "@/lib/api-security";

/** Parse + validate the shared body shape (POST/DELETE). */
async function parseBody(req: NextRequest): Promise<
  | { ok: true; contentType: "blog" | "lesson"; contentSlug: string }
  | { ok: false; response: NextResponse }
> {
  const body = (await req.json()) as {
    contentType?: unknown;
    contentSlug?: unknown;
  };

  if (typeof body.contentSlug !== "string" || body.contentSlug.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "contentType and contentSlug required" },
        { status: 400 },
      ),
    };
  }

  if (body.contentType !== "blog" && body.contentType !== "lesson") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "contentType must be 'blog' or 'lesson'" },
        { status: 400 },
      ),
    };
  }

  /* --- Slug validation (F2) ---
   * contentSlug uses the canonical ADR-002 namespaced form
   * (`blog/<slug>` / `lesson/<slug>` — matches localStorage keys, the DB
   * content_slug, and the summary merge in src/lib/progress.ts), so the
   * namespaced form is allowed here. Path traversal (`../`, extra slashes,
   * dots) is still rejected. */
  const slugErr = validateSlug(body.contentSlug, "contentSlug", {
    allowNamespaced: true,
  });
  if (slugErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: slugErr }, { status: 400 }),
    };
  }

  return { ok: true, contentType: body.contentType, contentSlug: body.contentSlug };
}

export async function POST(req: NextRequest) {
  try {
    /* --- Origin / CSRF check (F6) --- */
    const originErr = checkOrigin(req);
    if (originErr) {
      return NextResponse.json({ error: originErr }, { status: 403 });
    }

    /* --- Rate limit (F2) --- */
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = await parseBody(req);
    if (!parsed.ok) return parsed.response;

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ status: "unauthenticated" });
    }

    // Entitlement gate (t_10214e52 / CWE-862): lesson reads are course-gated
    // (blog reads are not part of any course). A user with no access to the
    // lesson's course must not fabricate read progress in a paywalled course.
    if (parsed.contentType === "lesson") {
      const gateErr = await denyLessonNotAccessible(
        user.id,
        parsed.contentSlug.replace(/^lesson\//, ""),
      );
      if (gateErr) return gateErr;
    }

    // Upsert: insert or update read_at timestamp
    const { error } = await supabase.from("read_progress").upsert(
      {
        user_id: user.id,
        content_type: parsed.contentType,
        content_slug: parsed.contentSlug,
        read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_slug" },
    );

    if (error) {
          return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
        }

        // G1 (celestial-immersion): a signed-in user reading a blog post appends
        // one 'article' completion event — the source of the profile galaxy's
        // free-floating stars. Idempotent per (user, event_type='article',
        // lesson_slug=blog slug); best-effort (a log failure must not fail the
        // read write, which already landed). Blog reads are not course-gated.
        if (parsed.contentType === "blog") {
          await appendCompletionEvent({
            userId: user.id,
            courseId: null,
            eventType: "article",
            lessonSlug: parsed.contentSlug.replace(/^blog\//, ""),
          });
        }

        return NextResponse.json({ status: "ok" });
      } catch {
        // Silently fail — client has localStorage fallback
        return NextResponse.json({ status: "error" }, { status: 500 });
      }
    }

    export async function DELETE(req: NextRequest) {
  try {
    /* --- Origin / CSRF check (F6) --- */
    const originErr = checkOrigin(req);
    if (originErr) {
      return NextResponse.json({ error: originErr }, { status: 403 });
    }

    /* --- Rate limit (F2) --- */
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = await parseBody(req);
    if (!parsed.ok) return parsed.response;

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ status: "unauthenticated" });
    }

    // Entitlement gate (t_10214e52 / CWE-862): lesson reads are course-gated
    // (blog reads are not part of any course).
    if (parsed.contentType === "lesson") {
      const gateErr = await denyLessonNotAccessible(
        user.id,
        parsed.contentSlug.replace(/^lesson\//, ""),
      );
      if (gateErr) return gateErr;
    }

    // Delete: remove the read row so unmark survives reloads
    const { error } = await supabase
      .from("read_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("content_type", parsed.contentType)
      .eq("content_slug", parsed.contentSlug);

    if (error) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
