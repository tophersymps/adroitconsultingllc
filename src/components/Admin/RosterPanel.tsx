"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  AccessModel,
  AdminCourseListRow,
  AdminUserListRow,
} from "@/shared/contracts-course-catalog";
import type { EffectiveAccessState } from "@/lib/access";
import { EffectiveAccessChip } from "./EffectiveAccessChip";
import { AccessGrid } from "./AccessGrid";
import { StatusBadge } from "@/components/Catalog/StatusBadge";

const ACCESS_MODELS: AccessModel[] = [
  "free",
  "subscription",
  "one-time",
  "sub-or-one-time",
  "granted",
];

/**
 * RosterPanel — course-first lens (Access · Courses, ADR-222). Pick a course,
 * see every user's effective-access chip, and grant/revoke in bulk. Change the
 * access model inline here and the roster immediately reflects how the seam
 * re-resolves each user. The AccessGrid below is the shared honest matrix.
 */
export function RosterPanel({
  courses,
  users,
  matrix,
  initialCourseSlugOrId,
  onBulkGrant,
  onBulkRevoke,
  onGrant,
  onRevoke,
  onAdjust,
  onChangeAccessModel,
  hideMatrix = false,
}: {
  courses: AdminCourseListRow[];
  users: AdminUserListRow[];
  matrix: Record<string, Record<string, EffectiveAccessState>>;
  initialCourseSlugOrId?: string | null;
  onBulkGrant: (userIds: string[], courseId: string) => Promise<boolean>;
  onBulkRevoke: (userIds: string[], courseId: string) => Promise<boolean>;
  onGrant: (userId: string, courseId: string) => Promise<boolean>;
  onRevoke: (userId: string, courseId: string) => Promise<boolean>;
  onAdjust: (
    userId: string,
    courseId: string,
    from: "granted" | "one-time",
    to: "granted" | "one-time",
  ) => Promise<boolean>;
  onChangeAccessModel?: (
    seriesSlug: string,
    nextModel: AccessModel,
  ) => Promise<boolean>;
  hideMatrix?: boolean;
}) {
  const initialId = useMemo(() => {
    if (initialCourseSlugOrId) {
      const matched = courses.find(
        (c) =>
          c.course.id === initialCourseSlugOrId ||
          c.course.series_slug === initialCourseSlugOrId,
      );
      if (matched) return matched.course.id;
    }
    return courses[0]?.course.id ?? null;
  }, [courses, initialCourseSlugOrId]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    initialId,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rosterSearch, setRosterSearch] = useState("");
  const [updatingModel, setUpdatingModel] = useState(false);

  const courseRow =
    courses.find((c) => c.course.id === selectedCourseId)?.course ??
    courses[0]?.course ??
    null;
  const course = courseRow;

  const activeUsers = useMemo(
    () =>
      users.filter((u) => u.status !== "tombstoned" && !u.deleted_at),
    [users],
  );

  const rows = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return activeUsers
      .filter((u) => {
        if (!q) return true;
        return (
          (u.display_name ?? u.email).toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      })
      .map((u) => ({
        user: u,
        state:
          (course ? matrix[u.user_id]?.[course.id] : "none") ??
          ("none" as EffectiveAccessState),
        src: course ? u.entitlements[course.id] : undefined,
      }));
  }, [activeUsers, matrix, course, rosterSearch]);

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
      const all = new Set(rows.map((r) => r.user.user_id));
      return rows.length > 0 && rows.every((r) => prev.has(r.user.user_id))
        ? new Set()
        : all;
    });
  }

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.user.user_id));
  const selIds = Array.from(selected);

  async function bulk(action: "grant" | "revoke") {
    if (!course) return;
    const ok =
      action === "grant"
        ? await onBulkGrant(selIds, course.id)
        : await onBulkRevoke(selIds, course.id);
    if (ok) setSelected(new Set());
  }

  async function handleModelChange(nextModel: AccessModel) {
    if (!course || !onChangeAccessModel) return;
    setUpdatingModel(true);
    try {
      await onChangeAccessModel(course.series_slug, nextModel);
    } finally {
      setUpdatingModel(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Course selector chips */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          borderColor: "var(--admin-table-border)",
          background: "var(--surface-card, #FFFFFF)",
        }}
      >
        <div
          className="flex flex-wrap gap-2 px-4 py-3.5 border-b"
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          {courses.map(({ course: c }) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCourseId(c.id)}
              aria-pressed={course?.id === c.id}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                course?.id === c.id
                  ? "border-[var(--color-red)] text-[var(--color-red)] bg-[var(--admin-selected-bg)]"
                  : "text-[var(--ink-muted)] hover:border-[var(--ink-soft)] hover:text-[var(--ink-primary)]"
              }`}
              style={{
                borderColor:
                  course?.id === c.id
                    ? "var(--color-red)"
                    : "var(--admin-table-border)",
              }}
            >
              <span>{c.title}</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-[var(--ink-muted)] bg-[var(--surface-sunken)]">
                {c.access_model}
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full">
                <StatusBadge status={c.status} />
              </span>
            </button>
          ))}
        </div>

        {/* Course strip with inline Access Model control */}
        {course && (
          <div
            className="flex items-center gap-3 px-4 py-3.5 border-b flex-wrap"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            <div>
              <div className="text-[16px] font-bold text-[var(--ink-primary)]">
                {course.title}
              </div>
              <div className="font-mono text-[10.5px] text-[var(--ink-faint)]">
                {course.series_slug} · id {course.id.slice(0, 8)}…
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              {onChangeAccessModel && (
                <label className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-muted)]">
                  <span>Access model:</span>
                  <select
                    value={course.access_model}
                    disabled={updatingModel}
                    aria-label={`Access model for ${course.title}`}
                    onChange={(e) =>
                      handleModelChange(e.target.value as AccessModel)
                    }
                    className="rounded-md border px-2 py-1 text-[12px] font-semibold text-[var(--ink-primary)] bg-[var(--surface-card)] disabled:opacity-50"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  >
                    {ACCESS_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <StatusBadge status={course.status} />
              <Link
                href="/admin/courses"
                className="rounded-md border px-2.5 py-1 text-[11px] font-semibold no-underline text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)]"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                Catalog Settings &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Bulk toolbar */}
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[var(--surface-sunken)]"
          style={{ borderBottom: "1px solid var(--admin-table-border)" }}
        >
          <span className="text-[12px] font-semibold text-[var(--ink-primary)]">
            {selIds.length} selected
          </span>
          <input
            type="search"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Filter people in roster…"
            aria-label="Filter people in roster"
            className="rounded-md border px-2.5 py-1 text-[12px] bg-[var(--surface-card, #FFFFFF)]"
            style={{ borderColor: "var(--admin-table-border)" }}
          />
          <div className="flex-1" />
          <button
            type="button"
            disabled={selIds.length === 0}
            onClick={() => bulk("grant")}
            className="text-[11.5px] font-semibold px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-md text-white bg-[var(--color-red)] hover:bg-[var(--color-red-dark)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            Bulk grant
          </button>
          <button
            type="button"
            disabled={selIds.length === 0}
            onClick={() => bulk("revoke")}
            className="text-[11.5px] font-semibold px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-md border text-[var(--color-red-dark)] hover:bg-[var(--color-red)] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            style={{ borderColor: "var(--color-red)" }}
          >
            Bulk revoke
          </button>
        </div>

        {/* Roster table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
                style={{ color: "var(--admin-table-head)" }}
              >
                <th scope="col" className="px-3 py-2 w-8">
                  <label className="flex h-11 w-11 items-center justify-center rounded hover:bg-[var(--surface-sunken)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label="Select all people"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </label>
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Person
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Effective access
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left hidden lg:table-cell"
                >
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user: u, state, src }) => (
                <tr
                  key={u.user_id}
                  className={`text-[12.5px] ${
                    selected.has(u.user_id)
                      ? "bg-[var(--admin-selected-bg)]"
                      : ""
                  }`}
                  style={{ borderTop: "1px solid var(--admin-table-border)" }}
                >
                  <td className="px-3 py-2.5">
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
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-[var(--ink-primary)]">
                      {u.display_name ?? u.email}
                    </span>
                    <span className="block font-mono text-[9.5px] text-[var(--ink-faint)]">
                      {u.email}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <EffectiveAccessChip state={state} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px] text-[var(--ink-faint)] hidden lg:table-cell">
                    {src
                      ? `user_entitlements · ${src}`
                      : state === "subscribed"
                        ? "active subscription"
                        : state === "free"
                          ? "course.access_model = free"
                          : "no path yet · locked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeUsers.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">No people found.</p>
          )}
        </div>
      </div>

      {/* AccessGrid — the honest matrix */}
      {!hideMatrix && (
        <div
          className="rounded-2xl border overflow-hidden"
        style={{
          borderColor: "var(--admin-table-border)",
          background: "var(--surface-card, #FFFFFF)",
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          <h3 className="text-[14px] font-bold text-[var(--ink-primary)]">
            Access grid
          </h3>
          <span className="font-mono text-[10.5px] text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">
            {activeUsers.length} × {courses.length}
          </span>
          <div className="flex-1" />
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            cell = effective access · click to act
          </span>
        </div>
        <AccessGrid
          users={activeUsers}
          courses={courses}
          matrix={matrix}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onAdjust={async (userId, courseId) => {
            const src = activeUsers.find((u) => u.user_id === userId)
              ?.entitlements[courseId];
            const to: "granted" | "one-time" =
              src === "granted" ? "one-time" : "granted";
            await onAdjust(userId, courseId, src ?? "granted", to);
          }}
        />
        <div
          className="flex flex-wrap gap-4 px-4 py-3 font-mono text-[10px] text-[var(--ink-faint)] border-t"
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          <Legend color="var(--access-granted)" label="Granted" />
          <Legend color="var(--access-one-time)" label="One-time" />
          <Legend color="var(--access-subscribed)" label="Subscribed" />
          <Legend color="var(--access-free)" label="Free" />
          <Legend color="var(--access-none)" label="None — locked" />
        </div>
      </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
