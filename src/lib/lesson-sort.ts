/**
 * Lesson-number sort helper (ADR-105).
 *
 * Pure client-safe module (no fs) so client components (SeriesSyllabus) can
 * re-sort the syllabus without bundling Node builtins.
 */

/** Lesson-number ascending (ADR-105); missing lesson numbers sort last, stable. */
export function sortLessonsByLessonNumber<T extends { lesson: number }>(
  items: T[],
  order: "asc" | "desc" = "asc",
): T[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const la = a.item.lesson > 0 ? a.item.lesson : Number.MAX_SAFE_INTEGER;
      const lb = b.item.lesson > 0 ? b.item.lesson : Number.MAX_SAFE_INTEGER;
      const diff = la - lb;
      if (diff !== 0) return order === "desc" ? -diff : diff;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}
