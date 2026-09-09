import Link from "next/link";
import type {
  CatalogNextCourse,
  PrerequisiteCourse,
} from "@/shared/contracts-course-catalog";

/**
 * PrerequisitesSection — Learn v2 course-profile block (plan §3c / ADR-208/209)
 * rendered on the course outline. Shows:
 *   - structured prerequisites (this course requires X → links to X)
 *   - recommended_background prose ("what level of knowledge helps")
 *   - the next-course seam callout ("what to take next", Level N ready)
 * Renders nothing when a course has none of these (standalone paths).
 */
export default function PrerequisitesSection({
  prerequisites,
  recommendedBackground,
  nextCourse,
}: {
  prerequisites: PrerequisiteCourse[];
  recommendedBackground: string | null | undefined;
  nextCourse?: CatalogNextCourse | null;
}) {
  const hasStructured = prerequisites.length > 0;
  const hasBackground = Boolean(recommendedBackground);
  const hasNext = Boolean(nextCourse?.nextCourseId);
  if (!hasStructured && !hasBackground && !hasNext) return null;

  return (
    <section
      aria-label="Prerequisites"
      className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card-soft)] p-6"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-[3px] h-4 rounded-sm bg-[var(--accent)]" aria-hidden />
        <h2 className="font-mono text-[12px] font-bold text-[var(--ink-faint)] uppercase tracking-[0.1em]">
          Prerequisites
        </h2>
      </div>

      <div className="space-y-4">
        {hasBackground && (
          <div>
            <h3 className="text-[12.5px] font-bold text-[var(--ink-primary)] mb-1">
              Recommended background
            </h3>
            <p className="text-[13.5px] text-[var(--ink-muted)] leading-relaxed">
              {recommendedBackground}
            </p>
          </div>
        )}

        {hasStructured && (
          <div>
            <h3 className="text-[12.5px] font-bold text-[var(--ink-primary)] mb-2">
              Required courses
            </h3>
            <ul className="space-y-2">
              {prerequisites.map((p) => (
                <li key={p.series_slug}>
                  <Link
                    href={`/learn/${p.series_slug}`}
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--accent)] no-underline hover:underline"
                  >
                    <span aria-hidden>→</span> {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasNext && (
          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <p className="text-[12.5px] font-bold text-[var(--ink-primary)] mb-1">
              What to take next
            </p>
            <p className="text-[13px] text-[var(--ink-muted)]">
              {nextCourse?.prerequisitesMet
                ? "You've met the prerequisites — this course is ready for you."
                : "Finish the prerequisites to unlock the next course in this track."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
