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
 *
 * PERF (PERF-LOW-2, t_10a6b284 / review of #371):
 *  - Identity comes from `getSessionUser()` — the canonical resolver — instead
 *    of `supabase.auth.getUser()`. `getSessionUser()` decides "no session
 *    cookie ⇒ guest" from `next/headers` alone, so a guest hub view costs ZERO
 *    DB reads and ZERO auth-backend round trips (this route fires on every
 *    /atlas visit, whose HTML is otherwise ○ Static).
 *  - The access gate was one `accessSeam.decideCourseAccess` per series (each
 *    re-reading role + entitlements + subscriptions, and the loaders are not
 *    `cache()`d) — up to ~36 serial DB round trips per signed-in view. It is
 *    now ONE `getCatalogForUser` call (courses + role + entitlements +
 *    subscriptions) whose `canAccess` flag is decided in memory per series.
 *
 * Budget for a signed-in view: 4 seam reads + 1 `lesson_completion` read = 5
 * DB reads, independent of the number of series. Guests: 0.
 *
 * `canAccess` from the seam is exactly "the decision is granted|admin-preview":
 * admin → true for every row (admin-preview), otherwise live + a granting
 * entitlement/subscription. See the equivalence test in src/lib/access.test.ts.
 */
import { NextResponse } from "next/server";
import { getAllSeries, getLessonsForSeries } from "@/lib/learn";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getSessionUser } from "@/lib/session";
import { accessSeam } from "@/lib/access";
import type { ContinueLearningItem } from "@/shared/contracts-account";

interface CompletionRow {
  lesson_slug: string;
  completed_at: string;
}

export async function GET() {
  try {
    // Guest fast path: no session cookie ⇒ guest, decided before any client
    // (data or auth) is constructed. Also the fail-safe for a broken auth
    // backend — reads degrade to the guest payload rather than throwing.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ items: [] });
    }

    const series = getAllSeries();

    // Access seam gate (US-006): only surface in-progress series the user can
    // actually read. not-launched/paywall → excluded from Continue Learning.
    // One seam read for the whole hub, then the per-series decision is pure.
    const catalog = await accessSeam.getCatalogForUser(user.id);
    const accessible = new Set<string>();
    for (const entry of catalog.entries) {
      if (entry.canAccess) accessible.add(entry.course.series_slug);
    }

    const supabase = await getSupabaseServerClient();
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
