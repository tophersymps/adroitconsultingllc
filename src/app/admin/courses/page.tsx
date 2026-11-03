"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminCourses } from "@/lib/hooks/useAdminCourses";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import { LaunchDialog } from "@/components/Admin/LaunchDialog";
import CourseProfileDialog from "@/components/Admin/CourseProfileDialog";
import CatalogOrgDialog from "@/components/Admin/CatalogOrgDialog";
import AdminToast, { type AdminToastMessage } from "@/components/Admin/AdminToast";
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

function formatPriceCents(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "—";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * /admin/courses (US-009, Content · Catalog) — unified course management:
 *   - Discover & 1-click provision unprovisioned MDX series on disk
 *   - Manage Catalog Sections & Groups (CatalogOrgDialog)
 *   - Filter by status, access model, or search query
 *   - Edit status, access model, price, title, org, and prerequisites
 *   - Jump directly to a course's user roster (/admin/access/courses?course=slug)
 */
export default function AdminCoursesPage() {
  const {
    rows,
    unprovisionedSeries = [],
    loading,
    error,
    refresh,
    provisionSeries,
  } = useAdminCourses();
  const [saving, setSaving] = useState<string | null>(null);
  const [provisioningSlug, setProvisioningSlug] = useState<string | null>(null);
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const [launching, setLaunching] = useState<CourseRow | null>(null);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CourseStatus | "all">("all");
  const [modelFilter, setModelFilter] = useState<AccessModel | "all">("all");

  async function onStatusChange(slug: string, status: CourseStatus) {
    setSaving(slug);
    setToast(null);
    const r = await refreshAndReport(async () => {
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
    if (r.ok) {
      setToast({ text: `Updated ${slug} → ${status}`, tone: "success" });
    } else {
      setToast({ text: r.error ?? "Update failed", tone: "error" });
    }
  }

  async function onModelChange(slug: string, access_model: AccessModel) {
    setSaving(slug);
    setToast(null);
    const r = await refreshAndReport(async () => {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_model }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return { ok: false, error: json.error };
      return { ok: true };
    });
    setSaving(null);
    if (r.ok) {
      setToast({ text: `Updated ${slug} access model`, tone: "success" });
    } else {
      setToast({ text: r.error ?? "Update failed", tone: "error" });
    }
  }

  async function handleProvision(slug: string, title?: string) {
    if (!provisionSeries) return;
    setProvisioningSlug(slug);
    try {
      const res = await provisionSeries(slug, { title });
      if (res.ok) {
        setToast({
          text: `Provisioned "${slug}" as pending course`,
          tone: "success",
        });
      } else {
        setToast({
          text: res.error ?? `Failed to provision ${slug}`,
          tone: "error",
        });
      }
    } finally {
      setProvisioningSlug(null);
    }
  }

  async function refreshAndReport(
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<{ ok: boolean; error?: string }> {
    const r = await fn();
    if (r.ok) await refresh();
    return r;
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(({ course }) => {
      if (statusFilter !== "all" && course.status !== statusFilter) return false;
      if (modelFilter !== "all" && course.access_model !== modelFilter) {
        return false;
      }
      if (!q) return true;
      return (
        course.title.toLowerCase().includes(q) ||
        course.series_slug.toLowerCase().includes(q) ||
        (course.track ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, statusFilter, modelFilter]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            Courses
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
            DB-backed status + access model are the source of truth. Configure
            catalog hierarchy, pricing, readiness, and learner rosters in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOrgDialogOpen(true)}
            className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-primary)] bg-[var(--surface-card, #FFFFFF)] hover:bg-[var(--surface-sunken)] transition-colors"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            Sections &amp; Groups
          </button>
          <Link
            href="/admin/access/courses"
            className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold no-underline text-[var(--ink-primary)] bg-[var(--surface-card, #FFFFFF)] hover:bg-[var(--surface-sunken)] transition-colors"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            Course Rosters &amp; Matrix &rarr;
          </Link>
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      {/* Unprovisioned Disk Series Banner */}
      {unprovisionedSeries.length > 0 && (
        <div
          className="rounded-xl border p-4 bg-amber-500/[0.06]"
          style={{ borderColor: "rgba(217, 119, 6, 0.35)" }}
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div>
              <div className="text-[13px] font-bold text-[var(--ink-primary)]">
                Unprovisioned Content Series on Disk ({unprovisionedSeries.length})
              </div>
              <div className="text-[11.5px] text-[var(--ink-muted)]">
                These MDX series exist in <code>content/learn/</code> but do not have a row in the <code>courses</code> table yet. Provisioning adds them as <code>pending</code> + <code>granted</code> so you can configure and launch them.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {unprovisionedSeries.map((s) => (
              <div
                key={s.slug}
                className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 bg-[var(--surface-card, #FFFFFF)]"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ink-primary)] truncate">
                    {s.name}
                  </div>
                  <div className="font-mono text-[10.5px] text-[var(--ink-faint)]">
                    {s.slug} · {s.publishedLessonCount} published / {s.totalLessonCount} total lessons
                  </div>
                </div>
                <button
                  type="button"
                  disabled={provisioningSlug === s.slug}
                  onClick={() => handleProvision(s.slug, s.name)}
                  className="shrink-0 rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--color-navy)" }}
                >
                  {provisioningSlug === s.slug ? "Provisioning…" : "+ Provision"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 bg-[var(--surface-card, #FFFFFF)]"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search courses by title, slug, or track…"
          aria-label="Search courses"
          className="flex-1 min-w-[220px] rounded-lg border px-3 py-1.5 text-[12.5px] bg-[var(--surface-sunken)]"
          style={{ borderColor: "var(--admin-table-border)" }}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Status:
          </span>
          {(["all", ...STATUSES] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold transition-colors ${
                statusFilter === st
                  ? "bg-[var(--color-navy)] text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Model:
          </span>
          <select
            value={modelFilter}
            onChange={(e) =>
              setModelFilter(e.target.value as AccessModel | "all")
            }
            aria-label="Filter by access model"
            className="rounded-md border px-2 py-1 font-mono text-[11px] bg-[var(--surface-sunken)]"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            <option value="all">all models</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden bg-[var(--surface-card, #FFFFFF)]"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="font-mono text-[11px] font-bold uppercase tracking-[0.07em]"
                style={{ color: "var(--admin-table-head)" }}
              >
                <th scope="col" className="px-4 py-3">
                  Series
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Access model
                </th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">
                  Lessons
                </th>
                <th scope="col" className="px-4 py-3 hidden lg:table-cell">
                  Price
                </th>
                <th scope="col" className="px-4 py-3 hidden md:table-cell">
                  Entitlements
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(
                ({
                  course,
                  activeEntitlementCount,
                  publishedLessonCount,
                  totalLessonCount,
                }) => (
                  <tr
                    key={course.id}
                    className="text-[13.5px]"
                    style={{
                      borderTop: "1px solid var(--admin-table-border)",
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[var(--ink-primary)]">
                        {course.title}
                      </span>
                      <div className="font-mono text-[11px] text-[var(--ink-muted)] hidden sm:block">
                        {course.series_slug}
                        {course.track ? ` · track: ${course.track}` : ""}
                        {course.difficulty ? ` · ${course.difficulty}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={course.status} />
                        <select
                          value={course.status}
                          disabled={saving === course.series_slug}
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
                          disabled={saving === course.series_slug}
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
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--ink-muted)] hidden lg:table-cell">
                      {typeof publishedLessonCount === "number" ? (
                        <span>
                          {publishedLessonCount}
                          {typeof totalLessonCount === "number" &&
                          totalLessonCount > publishedLessonCount
                            ? ` / ${totalLessonCount}`
                            : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--ink-muted)] hidden lg:table-cell">
                      {formatPriceCents(course.price_cents)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12.5px] text-[var(--ink-muted)] hidden md:table-cell">
                      <Link
                        href={`/admin/access/courses?course=${encodeURIComponent(course.series_slug)}`}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 no-underline text-[var(--ink-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--admin-selected-bg)] hover:text-[var(--color-red)] transition-colors"
                        title="Manage course user roster"
                      >
                        <span>{activeEntitlementCount}</span>
                        <span className="text-[10px]">roster &rarr;</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 items-center justify-end">
                        {course.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => setLaunching(course)}
                            className="rounded-md text-white text-[11.5px] font-semibold px-3 py-1.5 min-h-[44px] md:min-h-0 hover:opacity-90"
                            style={{ background: "var(--color-red)" }}
                          >
                            Launch &rarr;
                          </button>
                        )}
                        <Link
                          href={`/atlas/${course.series_slug}/preview`}
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
                ),
              )}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]"
                  >
                    No courses match the current filter.
                  </td>
                </tr>
              )}
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
          onToast={(msg) => setToast({ text: msg })}
        />
      )}

      {editing && (
        <CourseProfileDialog
          course={editing}
          allCourses={rows.map((r) => r.course)}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
          onToast={(msg) => setToast({ text: msg })}
        />
      )}

      {orgDialogOpen && (
        <CatalogOrgDialog
          onClose={() => setOrgDialogOpen(false)}
          onToast={(msg) => setToast({ text: msg })}
        />
      )}
    </div>
  );
}
