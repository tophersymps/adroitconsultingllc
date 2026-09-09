/**
 * GET /api/continue-learning — in-progress series for the Learn hub.
 *
 * Session-gated: guests → `{ items: [] }`. Signed-in users get series where
 * `completedCount >= 1 AND completedCount < totalLessons`, most-recent-first,
 * each with a resume link to the lowest-numbered uncompleted lesson.
 *
 * Data comes from existing `lesson_completion` (distinct slug count + latest
 * completed_at) joined to the content taxonomy in src/data/learn.ts. No new
 * tables. Contract: src/shared/contracts-account.ts (brainiac, t_cde0e74a).
 */
import { NextResponse } from "next/server";
import { getAllSeries, getLessonsForSeries } from "@/lib/learn";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { accessSeam } from "@/lib/access";
import type { ContinueLearningItem } from "@/shared/contracts-account";

interface CompletionRow {
  lesson_slug: string;
  completed_at: string;
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ items: [] });
    }

    const series = getAllSeries();

    // Access seam gate (US-006): only surface in-progress series the user can
    // actually read. not-launched/paywall → excluded from Continue Learning.
    const accessible = new Set<string>();
    for (const s of series) {
      const decision = await accessSeam.decideCourseAccess(user.id, s.slug);
      if (decision.kind === "granted" || decision.kind === "admin-preview") {
        accessible.add(s.slug);
      }
    }

    const { data } = await supabase
      .from("lesson_completion")
      .select("lesson_slug, completed_at")
      .eq("user_id", user.id);

    const rows = (data ?? []) as CompletionRow[];
    const bySlug = new Map<string, string[]>();
    for (const r of rows) {
      const arr = bySlug.get(r.lesson_slug) ?? [];
      arr.push(r.completed_at);
      bySlug.set(r.lesson_slug, arr);
    }

    const items: ContinueLearningItem[] = [];

    for (const s of series) {
      if (!accessible.has(s.slug)) continue;
      const lessonSlugs = s.lessons.map((l) => l.slug);
      const completedSlugs = lessonSlugs.filter((slug) => bySlug.has(slug));
      const completedCount = completedSlugs.length;
      const totalLessons = lessonSlugs.length;

      // In-progress: at least one completed, not yet complete.
      if (completedCount < 1 || completedCount >= totalLessons) continue;

      // Lowest-numbered uncompleted lesson = first in lesson-number order.
      const ordered = getLessonsForSeries(s.slug);
      const next = ordered.find((l) => !bySlug.has(l.slug));

      // Most-recent completion across the series (for desc sort).
      let lastCompletedAt: string | null = null;
      for (const slug of completedSlugs) {
        const times = bySlug.get(slug) ?? [];
        for (const t of times) {
          if (!lastCompletedAt || t > lastCompletedAt) lastCompletedAt = t;
        }
      }

      items.push({
        seriesSlug: s.slug,
        seriesName: s.name,
        gradient: s.gradient,
        nextLessonSlug: next?.slug ?? null,
        nextLessonTitle: next?.title ?? null,
        totalLessons,
        completedCount,
        percent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        lastCompletedAt,
      });
    }

    // Most-recent-first; ties → series slug asc.
    items.sort((a, b) => {
      const at = a.lastCompletedAt ?? "";
      const bt = b.lastCompletedAt ?? "";
      if (at !== bt) return at > bt ? -1 : 1;
      return a.seriesSlug.localeCompare(b.seriesSlug);
    });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
