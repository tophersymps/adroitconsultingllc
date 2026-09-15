"use client";

import { useMemo, useState } from "react";
import type {
  AdminCourseListRow,
  AdminUserListRow,
} from "@/shared/contracts-course-catalog";
import { EffectiveAccessChip } from "./EffectiveAccessChip";
import type { EffectiveAccessState } from "@/lib/access";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";

/**
 * AccessGrid — the honest five-state matrix (ADR-220/222). Renders every
 * user × live course as a single-letter effective-access cell (G/O/S/F/—),
 * computed by the seam — never "empty = no access". Shared by the People
 * (person-first) and Access·Courses (course-first) lenses. Dense, checkbox
 * column for bulk selection, hover/selected states, cell click opens an
 * action popover (Grant / Revoke / Adjust).
 */
const CELL_RGB: Record<EffectiveAccessState, string> = {
  granted: "225,29,72",
  "one-time": "13,148,136",
  subscribed: "124,58,237",
  free: "14,165,233",
  none: "",
};

export function AccessGrid({
  users,
  courses,
  matrix,
  onGrant,
  onRevoke,
  onAdjust,
}: {
  users: AdminUserListRow[];
  courses: AdminCourseListRow[];
  matrix: Record<string, Record<string, EffectiveAccessState>>;
  onGrant?: (userId: string, courseId: string) => void;
  onRevoke?: (userId: string, courseId: string) => void;
  onAdjust?: (userId: string, courseId: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<{
    userId: string;
    courseId: string;
  } | null>(null);

  // Only live courses show a real effective-access cell; pending/archived are
  // still listed (dimmed) via AccessModelChip + status so admins see the full
  // inventory, but their cells resolve to `none` (arch §2.3 rule 1).
  const liveCourses = useMemo(
    () => courses.filter((c) => c.course.status === "live"),
    [courses],
  );

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const all = new Set(users.map((u) => u.user_id));
      const allSelected = users.every((u) => prev.has(u.user_id));
      return allSelected ? new Set() : all;
    });
  }

  const allSelected = users.length > 0 && users.every((u) => selected.has(u.user_id));

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-left border-collapse"
        aria-label="Effective access grid"
      >
        <thead>
          <tr className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--admin-table-head)" }}>
            <th scope="col" className="px-3 py-2 w-8">
              <label className="flex h-11 w-11 items-center justify-center rounded hover:bg-[var(--surface-sunken)]">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  aria-label="Select all users"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </label>
            </th>
            <th scope="col" className="px-3 py-2 text-left min-w-[180px]">Person</th>
            {liveCourses.map(({ course }) => (
              <th scope="col" key={course.id} className="px-2 py-2 text-center min-w-[86px]">
                <div className="truncate max-w-[86px]">{course.series_slug}</div>
                <div className="mt-1 flex justify-center">
                  <AccessModelChip model={course.access_model} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.user_id}
              className={`text-[12.5px] transition-colors ${selected.has(u.user_id) ? "bg-[var(--admin-selected-bg)]" : ""}`}
              style={{ borderTop: "1px solid var(--admin-table-border)" }}
            >
              <td className="px-3 py-2">
                <label className="flex h-11 w-11 items-center justify-center rounded hover:bg-[var(--surface-sunken)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Select ${u.display_name ?? u.email}`}
                    checked={selected.has(u.user_id)}
                    onChange={() => toggleUser(u.user_id)}
                  />
                </label>
              </td>
              <td className="px-3 py-2">
                <span className="font-semibold text-[var(--ink-primary)]">
                  {u.display_name ?? u.email}
                </span>
                <span className="block font-mono text-[9.5px] text-[var(--ink-faint)]">
                  {u.email}
                </span>
              </td>
              {liveCourses.map(({ course }) => {
                const state: EffectiveAccessState =
                  matrix[u.user_id]?.[course.id] ?? "none";
                const rgb = CELL_RGB[state];
                return (
                  <td key={course.id} className="px-2 py-2 text-center relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveCell((cur) =>
                          cur?.userId === u.user_id && cur.courseId === course.id
                            ? null
                            : { userId: u.user_id, courseId: course.id },
                        )
                      }
                      aria-label={`${u.display_name ?? u.email} · ${course.series_slug} · ${state}`}
                      aria-expanded={
                        activeCell?.userId === u.user_id &&
                        activeCell.courseId === course.id
                      }
                      className="inline-flex items-center justify-center rounded-full font-mono text-[11px] font-bold hover:ring-2 hover:ring-[var(--color-red)]/40 transition-transform duration-100 hover:scale-105"
                      style={
                        state === "none"
                          ? {
                              width: "var(--admin-chip-size)",
                              height: "var(--admin-chip-size)",
                              backgroundColor: "var(--access-none-bg)",
                              color: "var(--access-none)",
                            }
                          : {
                              width: "var(--admin-chip-size)",
                              height: "var(--admin-chip-size)",
                              backgroundColor: `rgba(${rgb}, 0.14)`,
                              color: `var(--access-${state})`,
                            }
                      }
                    >
                      {state === "none" ? "—" : state[0].toUpperCase()}
                    </button>
                    {activeCell?.userId === u.user_id &&
                      activeCell.courseId === course.id && (
                        <div
                          className="absolute z-20 mt-1 rounded-lg border shadow-md bg-[var(--admin-popover-bg, #FFFFFF)] text-left"
                          style={{ borderColor: "var(--admin-popover-border, var(--border-subtle))" }}
                        >
                          <div className="px-2.5 py-2 text-[11px] font-semibold flex items-center gap-2">
                            <EffectiveAccessChip state={state} />
                          </div>
                          <div className="flex flex-col p-1 min-w-[120px]">
                            {(state === "none" || state === "free") && onGrant && (
                              <button
                                type="button"
                                className="text-left px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--color-red)] rounded hover:bg-[var(--surface-sunken)]"
                                onClick={() => {
                                  onGrant(u.user_id, course.id);
                                  setActiveCell(null);
                                }}
                              >
                                Grant granted
                              </button>
                            )}
                            {state !== "none" && onRevoke && (
                              <button
                                type="button"
                                className="text-left px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink-muted)] rounded hover:bg-[var(--surface-sunken)]"
                                onClick={() => {
                                  onRevoke(u.user_id, course.id);
                                  setActiveCell(null);
                                }}
                              >
                                Revoke
                              </button>
                            )}
                            {(state === "granted" || state === "one-time") && onAdjust && (
                              <button
                                type="button"
                                className="text-left px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink-muted)] rounded hover:bg-[var(--surface-sunken)]"
                                onClick={() => {
                                  onAdjust(u.user_id, course.id);
                                  setActiveCell(null);
                                }}
                              >
                                Adjust
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Mobile affordance — the grid keeps horizontal scroll (cell semantics
          are lost in cards, ADR-231) but must signal it on narrow screens. */}
      <p role="note" className="sm:hidden px-3 py-2 text-[10.5px] text-[var(--ink-faint)]">
        Scroll ← → to see every course.
      </p>
      {users.length === 0 && (
        <p className="px-4 py-6 text-sm text-gray-500">No users found.</p>
      )}
    </div>
  );
}
