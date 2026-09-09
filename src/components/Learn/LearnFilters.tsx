/**
 * LearnFilters — client filter chips + search for the /learn hub (Learn v2).
 *
 * Section chips come from catalog_sections rows (Certifications / Tracks /
 * Learning Paths); group chips (under the active section) from catalog_groups
 * rows — NOT from a bucketOf() regex or content group/subgroup (ADR-206/207).
 * A search box filters courses by name/description/difficulty/group client-side.
 * Pure presentational: reports the active section/group/query to the parent
 * (LearnHub) which owns the state + renders the card sections.
 */

"use client";

interface OrgRef {
  slug: string;
  name: string;
  count: number;
}

interface LearnFiltersProps {
  /** Top-level sections present in the catalog (in DB sort_order) + course count. */
  sections: OrgRef[];
  /** All groups (slug/name/sectionSlug) — for the group chips. */
  groups: { slug: string; name: string; sectionSlug: string }[];
  sectionSlug: string | null; // null = "All sections"
  groupSlug: string | null;
  query: string;
  onSectionChange: (slug: string | null) => void;
  onGroupChange: (slug: string | null) => void;
  onQueryChange: (query: string) => void;
}

export default function LearnFilters({
  sections,
  groups,
  sectionSlug,
  groupSlug,
  query,
  onSectionChange,
  onGroupChange,
  onQueryChange,
}: LearnFiltersProps) {
  // Groups under the active section (all when "All sections").
  const sectionGroups = groups.filter(
    (g) => !sectionSlug || g.sectionSlug === sectionSlug,
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Section chips */}
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter by section">
          <button
            type="button"
            onClick={() => onSectionChange(null)}
            aria-pressed={sectionSlug === null}
            className={`text-[13px] font-semibold px-[18px] min-h-[44px] inline-flex items-center justify-center rounded-full border cursor-pointer transition-all duration-150 ${
              sectionSlug === null
                ? "bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] border-[var(--surface-inverse)] shadow-md"
                : "bg-[var(--surface-card)] text-[var(--ink-muted)] border-[var(--border-default)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
            }`}
          >
            All{" "}
            <span className="font-mono text-[10.5px] ml-1.5 opacity-75">
              {sections.reduce((acc, s) => acc + s.count, 0)}
            </span>
            </button>
            {sections.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => onSectionChange(s.slug)}
                aria-pressed={sectionSlug === s.slug}
                className={`text-[13px] font-semibold px-[18px] min-h-[44px] inline-flex items-center justify-center rounded-full border cursor-pointer transition-all duration-150 ${
                  sectionSlug === s.slug
                    ? "bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] border-[var(--surface-inverse)] shadow-md"
                    : "bg-[var(--surface-card)] text-[var(--ink-muted)] border-[var(--border-default)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                {s.name}{" "}
                <span className="font-mono text-[10.5px] ml-1.5 opacity-75">
                  {s.count}
                </span>
              </button>
            ))}
            </div>

        {/* Search */}
        <label className="relative block sm:w-64">
          <span className="sr-only">Search courses</span>
          <span
            aria-hidden
            className="absolute inset-y-0 left-3 flex items-center text-[var(--ink-faint)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search courses…"
            className="w-full min-h-[44px] rounded-full border border-[var(--border-default)] bg-[var(--surface-card)] text-[13px] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] pl-9 pr-4 outline-none focus:border-[var(--accent)] transition-colors"
          />
        </label>
      </div>

      {/* Group chips — revealed when a section with groups is active */}
      {sectionGroups.length > 0 && sectionSlug && (
        <div
          className="flex gap-2 flex-wrap mt-3"
          role="group"
          aria-label="Filter by group"
        >
          <button
            type="button"
            onClick={() => onGroupChange(null)}
            aria-pressed={groupSlug === null}
            className={`font-mono text-[11px] font-bold px-[14px] min-h-[44px] inline-flex items-center justify-center rounded-full border cursor-pointer uppercase tracking-[0.05em] transition-all duration-150 ${
              groupSlug === null
                ? "bg-[var(--accent-bg)] text-white border-[var(--accent-bg)]"
                : "bg-[var(--surface-card-soft)] text-[var(--ink-faint)] border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            All groups
          </button>
          {sectionGroups.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => onGroupChange(g.slug)}
              aria-pressed={groupSlug === g.slug}
              className={`font-mono text-[11px] font-bold px-[14px] min-h-[44px] inline-flex items-center justify-center rounded-full border cursor-pointer uppercase tracking-[0.05em] transition-all duration-150 ${
                groupSlug === g.slug
                  ? "bg-[var(--accent-bg)] text-white border-[var(--accent-bg)]"
                  : "bg-[var(--surface-card-soft)] text-[var(--ink-faint)] border-dashed border-[var(--border-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
