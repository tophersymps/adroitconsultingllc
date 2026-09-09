import type { CourseStatus } from "@/shared/contracts-course-catalog";

/**
 * StatusBadge — course lifecycle signal pill (pending/live/archived) shared
 * across the catalog and admin surfaces. kara tokens (design-tokens-course-
 * catalog-admin.css §1): mono uppercase, signal-colored dot + tinted bg.
 */
const SIGNALS: Record<
  CourseStatus,
  { label: string; fg: string; bg: string }
> = {
  pending: { label: "Pending", fg: "var(--signal-pending)", bg: "var(--signal-pending-bg)" },
  live: { label: "Live", fg: "var(--signal-live)", bg: "var(--signal-live-bg)" },
  archived: { label: "Archived", fg: "var(--signal-archived)", bg: "var(--signal-archived-bg)" },
};

export function StatusBadge({ status }: { status: CourseStatus }) {
  const s = SIGNALS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-mono text-[11px] font-semibold uppercase tracking-[0.05em] px-2 py-0.5"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: s.fg }}
      />
      {s.label}
    </span>
  );
}
