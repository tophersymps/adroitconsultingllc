"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminCourses } from "@/lib/hooks/useAdminCourses";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import { LaunchDialog } from "@/components/Admin/LaunchDialog";
import CourseProfileDialog from "@/components/Admin/CourseProfileDialog";
import type {
  AccessModel,
  CourseRow,
  CourseStatus,
} from "@/shared/contracts-course-catalog";

const STATUSES: CourseStatus[] = ["pending", "live", "archived"];
const MODELS: AccessModel[] = [
  "free",
  "subscription",
  "one-time",
  "sub-or-one-time",
  "granted",
];

/**
 * /admin/courses (US-009, moved from /admin in v4 t_0ed19ad0) — course
 * management. Client table fed by GET /api/admin/courses; status/access-model
 * changes PATCH per course. Pending rows get a Launch → button that opens the
 * two-step LaunchDialog (preview + confirm) — the server enforces the same
 * readiness gate, so a half-finished course can never go live.
 */
export default function AdminCoursesPage() {
  const { rows, loading, error, refresh } = useAdminCourses();
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [launching, setLaunching] = useState<CourseRow | null>(null);
  const [editing, setEditing] = useState<CourseRow | null>(null);

  async function onStatusChange(slug: string, status: CourseStatus) {
    setSaving(slug);
    setToast(null);
    const ok = await refreshAndReport(async () => {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) return { ok: false, error: json.error };
      return { ok: true };
    });
    setSaving(null);
    setToast(ok ? `Updated ${slug} → ${status}` : "Update failed");
  }

  async function onModelChange(slug: string, access_model: AccessModel) {
    setSaving(slug);
    setToast(null);
    const ok = await refreshAndReport(async () => {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_model }),
      });
      return { ok: res.ok };
    });
    setSaving(null);
    setToast(ok ? `Updated ${slug} access model` : "Update failed");
  }

  /** Run a mutation, refresh rows, return success. */
  async function refreshAndReport(
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<boolean> {
    const r = await fn();
    if (r.ok) await refresh();
    else if (r.error) setToast(r.error);
    return r.ok;
  }

  if (loading)
    return (
      <p role="status" className="text-sm text-gray-500">
        Loading courses…
      </p>
    );
  if (error)
    return (
      <p role="status" className="text-sm text-red-600">
        {error}
      </p>
    );
  if (!rows) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            Courses
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
            DB-backed status + access model are the source of truth.
          </p>
        </div>
        {toast && (
          <span
            role="status"
            aria-live="polite"
            className="text-[12.5px] font-medium text-emerald-700 bg-emerald/10 px-3 py-1.5 rounded-full"
          >
            {toast}
          </span>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="font-mono text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--admin-table-head)" }}>
                <th scope="col" className="px-4 py-3">Series</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Access model</th>
                <th scope="col" className="px-4 py-3 hidden md:table-cell">Entitlements</th>
                <th scope="col" className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ course, activeEntitlementCount }) => (
                <tr key={course.id} className="text-[13.5px]" style={{ borderTop: "1px solid var(--admin-table-border)" }}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[var(--ink-primary)]">
                      {course.title}
                    </span>
                    <div className="font-mono text-[11px] text-[var(--ink-muted)] hidden sm:block">
                      {course.series_slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {/* Reconciled single Status column (ADR-231): the read-only
                        badge + the editable select both describe the same status —
                        keeping them as two columns duplicated the header. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={course.status} />
                      <select
                        value={course.status}
                        disabled={saving === course.id}
                        aria-label={`Status for ${course.title}`}
                        onChange={(e) =>
                          onStatusChange(
                            course.series_slug,
                            e.target.value as CourseStatus,
                          )
                        }
                        className="rounded-md border text-[12.5px] px-2 py-1.5 min-h-[44px] md:min-h-0 bg-transparent disabled:opacity-50"
                        style={{ borderColor: "var(--admin-table-border)" }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AccessModelChip model={course.access_model} />
                      <select
                        value={course.access_model}
                        disabled={saving === course.id}
                        aria-label={`Access model for ${course.title}`}
                        onChange={(e) =>
                          onModelChange(
                            course.series_slug,
                            e.target.value as AccessModel,
                          )
                        }
                        className="rounded-md border text-[12.5px] px-2 py-1.5 min-h-[44px] md:min-h-0 bg-transparent disabled:opacity-50"
                        style={{ borderColor: "var(--admin-table-border)" }}
                      >
                        {MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px] text-[var(--ink-muted)] hidden md:table-cell">
                    {activeEntitlementCount}
                  </td>
                  <td className="px-4 py-3">
                    {/* Action cluster wraps never-negated on mobile; every
                        action is a ≥44px touch target below md (ADR-233). */}
                    <div className="flex flex-wrap gap-1.5 items-center justify-end">
                      {course.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => setLaunching(course)}
                          className="rounded-md text-white text-[11.5px] font-semibold px-3 py-1.5 min-h-[44px] md:min-h-0 hover:opacity-90"
                          style={{ background: "var(--color-red)" }}
                        >
                          Launch →
                        </button>
                      )}
                      <Link
                        href={`/learn/${course.series_slug}/preview`}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[11.5px] font-semibold no-underline text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)] min-h-[44px] md:min-h-0"
                        style={{ borderColor: "var(--admin-table-border)" }}
                      >
                        Preview first lesson <span aria-hidden>&rarr;</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditing(course)}
                        className="rounded-md border px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)] min-h-[44px] md:min-h-0"
                        style={{ borderColor: "var(--admin-table-border)" }}
                      >
                        Edit profile
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {launching && (
        <LaunchDialog
          course={launching}
          onClose={() => setLaunching(null)}
          onLaunched={() => {
            setLaunching(null);
            void refresh();
          }}
          onToast={(msg) => setToast(msg)}
        />
      )}

      {editing && (
        <CourseProfileDialog
          course={editing}
          allCourses={rows.map((r) => r.course)}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
          onToast={(msg) => setToast(msg)}
        />
      )}
    </div>
  );
}
