/**
 * POST /api/progress/lesson — mark a lesson as complete.
 * DELETE /api/progress/lesson — unmark a lesson as complete (removes the row).
 *
 * Upserts a lesson_completion row in Supabase for authenticated users, then
 * routes the durable write through the shared completeLessonServer() helper so
 * the knowledge-check and exam tiers (both server-authoritative) reuse the same
 * lesson/course completion logic.
 *
 * Silently fails if no auth or Supabase is unavailable (client keeps
 * localStorage as the fallback).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCanonicalLessonSlugs, findSeriesForLessonSlug } from "@/lib/learn";
import { accessSeam } from "@/lib/access";
import { completeLessonServer } from "@/lib/progress-complete";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
  sanitiseDbError,
  validateSlug,
} from "@/lib/api-security";

/** Parse + validate the shared lessonSlug body (POST/DELETE). */
async function parseBody(req: NextRequest): Promise<
  | { ok: true; lessonSlug: string }
  | { ok: false; response: NextResponse }
> {
  const body = (await req.json()) as { lessonSlug?: unknown };

  if (typeof body.lessonSlug !== "string" || body.lessonSlug.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "lessonSlug required" },
        { status: 400 },
      ),
    };
  }

  /* --- Slug validation (F2) --- */
  const slugErr = validateSlug(body.lessonSlug, "lessonSlug");
  if (slugErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: slugErr }, { status: 400 }),
    };
  }

  return { ok: true, lessonSlug: body.lessonSlug };
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

    // F5 (CWE-345): only canonical lesson slugs may be marked complete. The
    // client syncs lessons it renders, but a forged POST must not be able to
    // fabricate completion for non-existent/foreign lessons (which could
    // otherwise satisfy the certificate's "all lessons completed" rule).
    if (!getAllCanonicalLessonSlugs().has(parsed.lessonSlug)) {
      return NextResponse.json(
        { error: "Unknown lesson slug" },
        { status: 400 },
      );
    }

    // Access seam gate (US-006): deny progress writes for a lesson in a course
    // the user can't read (not-launched / paywall).
    const gateErr = await denyIfNotAccessible(user.id, parsed.lessonSlug);
    if (gateErr) return gateErr;

    // Server-authoritative completion write: upsert the lesson_completion row,
    // log the 'lesson' event, and log the 'course' event when that was the last
    // published lesson in the series. The shared helper also powers the
    // knowledge-check and exam tiers (no behavior change here).
    const result = await completeLessonServer({
      userId: user.id,
      lessonSlugs: [parsed.lessonSlug],
    });
    if (!result.ok) {
      return NextResponse.json(
        { status: "error", error: sanitiseDbError(result.error) },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch {
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

    // Access seam gate (US-006): deny writes for a locked course.
    const gateErr = await denyIfNotAccessible(user.id, parsed.lessonSlug);
    if (gateErr) return gateErr;

    // Delete: remove the completion row so unmark survives reloads
    const { error } = await supabase
      .from("lesson_completion")
      .delete()
      .eq("user_id", user.id)
      .eq("lesson_slug", parsed.lessonSlug);

    if (error) {
      return NextResponse.json({ status: "error", error: sanitiseDbError(error) }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

/**
 * Access-seam gate for a lesson write (US-006). Resolves the lesson's series,
 * then denies (403) when the course is not-launched or paywalled for the user.
 * Returns null when the write may proceed. Fail-closed: DB errors deny.
 */
async function denyIfNotAccessible(
  userId: string,
  lessonSlug: string,
): Promise<NextResponse | null> {
  try {
    const series = findSeriesForLessonSlug(lessonSlug);
    if (!series) return null; // unknown lesson — canonical check already handled
    const decision = await accessSeam.decideCourseAccess(userId, series);
    if (decision.kind === "granted" || decision.kind === "admin-preview") {
      return null;
    }
    return NextResponse.json(
      { error: "This course is not available to you" },
      { status: 403 },
    );
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
