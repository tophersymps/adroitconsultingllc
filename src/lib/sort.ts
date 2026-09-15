/**
 * Sort helpers for blog listings.
 *
 * All post listings render NEWEST FIRST by default (Chris requirement,
 * 2026-08-05 audit). Ordering is defensive — never trust the generated
 * posts.ts array order in a view; always sort here.
 *
 * Dates are display strings like "August 5, 2026" or "August 04, 2026".
 * `new Date("August 5, 2026")` parses fine in V8; unparseable dates sort
 * last in either direction (stable).
 */

export type SortOrder = "newest" | "oldest";

export function dateTime(date: string): number {
  if (!date || date === "Date unknown") return -Infinity;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Sort posts newest-first (default) or oldest-first.
 * Unparseable dates always sort last, stable.
 */
export function sortPosts<T extends { date: string }>(
  items: T[],
  order: SortOrder = "newest",
): T[] {
  return [...items].sort((a, b) => {
    const da = dateTime(a.date);
    const db = dateTime(b.date);
    // Invalid dates (-Infinity) sort last in BOTH directions
    if (da === db) return 0;
    if (da === -Infinity) return 1;
    if (db === -Infinity) return -1;
    return order === "oldest" ? da - db : db - da;
  });
}
