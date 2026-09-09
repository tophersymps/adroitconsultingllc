/**
 * src/lib/access-gate.ts — shared access-seam gate for progress/quiz APIs.
 *
 * Security audit t_10214e52 (HIGH / CWE-862): every progress/quiz API must
 * enforce the entitlement check before returning server-graded data or
 * writing progress rows. Mirrors the gate in progress/lesson/route.ts
 * (denyIfNotAccessible): resolve the course series, run decideCourseAccess,
 * and 403 on not-launched / paywall. Fail-closed — any DB error denies
 * (500), never a silent grant.
 */
import { NextResponse } from "next/server";
import { accessSeam } from "@/lib/access";
import { parseQuizName } from "@/lib/quiz";
import { findSeriesForLessonSlug } from "@/lib/learn";

/** 403 body used when a course is not accessible to the caller. */
const DENIED = NextResponse.json(
  { error: "This course is not available to you" },
  { status: 403 },
);

/**
 * Gate a course series. Returns null when access is granted (or when no
 * series could be resolved to gate against), otherwise a 403/500 response.
 */
export async function denySeriesNotAccessible(
  userId: string,
  series: string | undefined,
): Promise<NextResponse | null> {
  if (!series) return null; // unknown series → nothing to gate
  try {
    const decision = await accessSeam.decideCourseAccess(userId, series);
    if (decision.kind === "granted" || decision.kind === "admin-preview") {
      return null;
    }
    return DENIED;
  } catch {
    // Fail closed: a DB/loader error must not grant access.
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Gate a quiz by its quizName. Tier names (`<series>:lesson:<slug>` /
 * `<series>:check:<n>` / `<series>:exam`) resolve the series from the first
 * segment; legacy bare series names are themselves the series slug.
 */
export async function denyQuizNotAccessible(
  userId: string,
  quizName: string,
): Promise<NextResponse | null> {
  const series = parseQuizName(quizName)?.series ?? quizName;
  return denySeriesNotAccessible(userId, series);
}

/** Gate a lesson by its (non-namespaced) slug. */
export async function denyLessonNotAccessible(
  userId: string,
  lessonSlug: string,
): Promise<NextResponse | null> {
  return denySeriesNotAccessible(userId, findSeriesForLessonSlug(lessonSlug));
}
