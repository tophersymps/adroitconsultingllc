"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAdminCourses } from "@/lib/hooks/useAdminCourses";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import { LaunchDialog } from "@/components/Admin/LaunchDialog";
import CourseProfileDialog from "@/components/Admin/CourseProfileDialog";
import CatalogOrgDialog from "@/components/Admin/CatalogOrgDialog";
import AdminToast, { type AdminToastMessage } from "@/components/Admin/AdminToast";
import { RosterPanel } from "@/components/Admin/RosterPanel";
import { AccessGrid } from "@/components/Admin/AccessGrid";
import type {
  AccessModel,
  CatalogGroup,
  CatalogSection,
  CourseRow,
  CourseStatus,
} from "@/shared/contracts-course-catalog";

export type CoursesTab = "catalog" | "roster" | "sections" | "matrix";

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

function AdminCoursesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab & Deep-linking state
  const tabParam = (searchParams.get("tab") as CoursesTab) || "catalog";
  const [activeTab, setActiveTab] = useState<CoursesTab>(
    ["catalog", "roster", "sections", "matrix"].includes(tabParam)
      ? tabParam
      : "catalog",
  );
  const initialCourseParam = searchParams.get("course");

  // Keep activeTab in sync if search params change externally (adjust during render per React guidance)
  const [prevTab, setPrevTab] = useState(tabParam);
  if (prevTab !== tabParam) {
    setPrevTab(tabParam);
    if (tabParam && ["catalog", "roster", "sections", "matrix"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }

  // Hook 1: Catalog & unprovisioned series
  const coursesHook = useAdminCourses();
  const {
    rows,
    unprovisionedSeries = [],
    loading: coursesLoading,
    error: coursesError,
    refresh: refreshCourses,
    provisionSeries,
  } = coursesHook;

  // Hook 2: Roster & Matrix access effective
  const effectiveHook = useAdminAccessEffective();
  const {
    data: effectiveData,
    loading: effectiveLoading,
    error: effectiveError,
    refresh: refreshEffective,
  } = effectiveHook;

  // Catalog UI state
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [saving, setSaving] = useState<string | null>(null);
  const [provisioningSlug, setProvisioningSlug] = useState<string | null>(null);
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const [launching, setLaunching] = useState<CourseRow | null>(null);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CourseStatus | "all">("all");
  const [modelFilter, setModelFilter] = useState<AccessModel | "all">("all");

  // Sections tab data
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const loadSectionsAndGroups = useCallback(async () => {
    setLoadingOrg(true);
    try {
      const [sRes, gRes] = await Promise.all([
        fetch("/api/admin/catalog/sections"),
        fetch("/api/admin/catalog/groups"),
      ]);
      const [sJson, gJson] = await Promise.all([sRes.json(), gRes.json()]);
      setSections(sJson.data ?? []);
      setGroups(gJson.data ?? []);
    } catch {
      // Non-fatal fallback
    } finally {
      setLoadingOrg(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "sections") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadSectionsAndGroups();
    }
  }, [activeTab, loadSectionsAndGroups]);

  function switchTab(nextTab: CoursesTab) {
    setActiveTab(nextTab);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", nextTab);
    router.replace(`/admin/courses?${sp.toString()}`, { scroll: false });
  }

  function viewCourseRoster(seriesSlugOrId: string) {
    setActiveTab("roster");
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "roster");
    sp.set("course", seriesSlugOrId);
    router.replace(`/admin/courses?${sp.toString()}`, { scroll: false });
  }

  // --- Catalog mutations ---
  async function onStatusChange(slug: string, status: CourseStatus): Promise<boolean> {
    setSaving(slug);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToast({ text: json.error ?? "Update failed", tone: "error" });
        return false;
      } else {
        await Promise.all([refreshCourses(), refreshEffective?.()]);
        setToast({ text: `Updated ${slug} → ${status}`, tone: "success" });
        return true;
      }
    } catch {
      setToast({ text: "Update failed", tone: "error" });
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function onModelChange(slug: string, access_model: AccessModel): Promise<boolean> {
    setSaving(slug);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_model }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setToast({ text: json.error ?? "Update failed", tone: "error" });
        return false;
      } else {
        await Promise.all([refreshCourses(), refreshEffective?.()]);
        setToast({ text: `Updated ${slug} access model → ${access_model}`, tone: "success" });
        return true;
      }
    } catch {
      setToast({ text: "Update failed", tone: "error" });
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function handleProvision(slug: string, title?: string) {
    if (!provisionSeries) return;
    setProvisioningSlug(slug);
    try {
      const res = await provisionSeries(slug, { title });
      if (res.ok) {
        await Promise.all([refreshCourses(), refreshEffective?.()]);
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

  // --- Roster & Matrix mutations ---
  async function onBulkGrant(userIds: string[], courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds, courseId }),
      });
      const ok = res.ok;
      if (ok) await Promise.all([refreshEffective?.(), refreshCourses()]);
      setToast({
        text: ok ? `Bulk granted ${userIds.length} user(s)` : "Bulk grant failed",
        tone: ok ? "success" : "error",
      });
      return ok;
    } catch {
      setToast({ text: "Bulk grant failed", tone: "error" });
      return false;
    }
  }

  async function onBulkRevoke(userIds: string[], courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements/bulk", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds, courseId }),
      });
      const ok = res.ok;
      if (ok) await Promise.all([refreshEffective?.(), refreshCourses()]);
      setToast({
        text: ok ? `Bulk revoked ${userIds.length} user(s)` : "Bulk revoke failed",
        tone: ok ? "success" : "error",
      });
      return ok;
    } catch {
      setToast({ text: "Bulk revoke failed", tone: "error" });
      return false;
    }
  }

  async function onGrant(userId: string, courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, courseId }),
      });
      const ok = res.ok;
      if (ok) {
        await Promise.all([refreshEffective?.(), refreshCourses()]);
        setToast({ text: "Access granted", tone: "success" });
      } else {
        setToast({ text: "Grant failed", tone: "error" });
      }
      return ok;
    } catch {
      setToast({ text: "Grant failed", tone: "error" });
      return false;
    }
  }

  async function onRevoke(userId: string, courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, courseId }),
      });
      const ok = res.ok;
      if (ok) {
        await Promise.all([refreshEffective?.(), refreshCourses()]);
        setToast({ text: "Access revoked", tone: "success" });
      } else {
        setToast({ text: "Revoke failed", tone: "error" });
      }
      return ok;
    } catch {
      setToast({ text: "Revoke failed", tone: "error" });
      return false;
    }
  }

  async function onAdjust(
    userId: string,
    courseId: string,
    from: "granted" | "one-time",
    to: "granted" | "one-time",
  ): Promise<boolean> {
    const revoked = await onRevoke(userId, courseId);
    if (!revoked) return false;
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, courseId, source: to }),
      });
      const ok = res.ok;
      if (ok) {
        await Promise.all([refreshEffective?.(), refreshCourses()]);
        setToast({ text: `Adjusted ${from} → ${to}`, tone: "success" });
      } else {
        setToast({ text: "Adjust failed", tone: "error" });
      }
      return ok;
    } catch {
      setToast({ text: "Adjust failed", tone: "error" });
      return false;
    }
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

  const activeLearnersCount = useMemo(() => {
    if (!effectiveData?.users) return 0;
    return effectiveData.users.filter((u) => u.status !== "tombstoned" && !u.deleted_at).length;
  }, [effectiveData]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            Courses
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 max-w-[780px]">
            Unified course administration — manage catalog pricing and readiness,
            student rosters, curriculum sections, and the access matrix.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOrgDialogOpen(true)}
            className="rounded-lg border border-[var(--admin-table-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-primary)] bg-[var(--surface-card)] hover:bg-[var(--surface-sunken)] transition-colors shadow-xs"
            style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
          >
            🗂️ Sections &amp; Groups
          </button>
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      {/* Unified Tab Switcher */}
      <div
        className="flex items-center gap-2 border-b overflow-x-auto pb-1"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <button
          type="button"
          onClick={() => switchTab("catalog")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg font-bold text-xs transition-colors shrink-0 ${
            activeTab === "catalog"
              ? "bg-[var(--surface-card)] text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          }`}
        >
          <span>📋 Catalog &amp; Pricing</span>
          {rows && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--surface-sunken)]">
              {rows.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab("roster")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg font-bold text-xs transition-colors shrink-0 ${
            activeTab === "roster"
              ? "bg-[var(--surface-card)] text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          }`}
        >
          <span>👥 Student Rosters &amp; Access</span>
          {activeLearnersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--surface-sunken)]">
              {activeLearnersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab("sections")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg font-bold text-xs transition-colors shrink-0 ${
            activeTab === "sections"
              ? "bg-[var(--surface-card)] text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          }`}
        >
          <span>🗂️ Sections &amp; Libraries</span>
        </button>

        <button
          type="button"
          onClick={() => switchTab("matrix")}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg font-bold text-xs transition-colors shrink-0 ${
            activeTab === "matrix"
              ? "bg-[var(--surface-card)] text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          }`}
        >
          <span>📊 Access Matrix</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CATALOG & PRICING
          ========================================================================= */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
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
                    These MDX series exist in <code>content/learn/</code> but do not have a row in the <code>courses</code> table yet.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {unprovisionedSeries.map((s) => (
                  <div
                    key={s.slug}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-table-border)] px-3.5 py-2.5 bg-[var(--surface-card)]"
                    style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[var(--ink-primary)] truncate">
                        {s.name}
                      </div>
                      <div className="font-mono text-[10.5px] text-[var(--ink-faint)]">
                        {s.slug} · {s.publishedLessonCount} published / {s.totalLessonCount} lessons
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

          {/* Catalog Toolbar: Filters + Cards/Table Switcher */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--admin-table-border)] px-4 py-3 bg-[var(--surface-card)]"
            style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
          >
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses by title, slug, or track…"
                aria-label="Search courses"
                className="flex-1 min-w-[200px] rounded-lg border px-3 py-1.5 text-[12.5px] bg-[var(--surface-sunken)]"
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
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  Model:
                </span>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value as AccessModel | "all")}
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

            {/* View Mode Toggle */}
            <div
              className="flex items-center rounded-lg border p-0.5 bg-[var(--surface-sunken)] shrink-0"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === "cards"
                    ? "bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-xs"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                }`}
              >
                ▦ Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-xs"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                }`}
              >
                ☰ Table
              </button>
            </div>
          </div>

          {/* Loading / Error States */}
          {coursesLoading && !rows && (
            <p role="status" className="text-sm text-gray-500 py-6 text-center">
              Loading courses…
            </p>
          )}
          {coursesError && (
            <p role="status" className="text-sm text-red-600 py-6 text-center">
              {coursesError}
            </p>
          )}

          {/* CARDS VIEW */}
          {rows && viewMode === "cards" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRows.map(
                ({
                  course,
                  activeEntitlementCount,
                  publishedLessonCount,
                  totalLessonCount,
                }) => (
                  <div
                    key={course.id}
                    className="rounded-2xl border border-[var(--admin-table-border)] bg-[var(--surface-card)] p-5 flex flex-col justify-between transition-all hover:shadow-md"
                    style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
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
                            className="rounded-md border border-[var(--admin-table-border)] text-[11px] font-semibold px-2 py-1 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden disabled:opacity-50 cursor-pointer"
                            style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
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
                            className="rounded-md border border-[var(--admin-table-border)] text-[11px] font-semibold px-2 py-1 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden disabled:opacity-50 cursor-pointer"
                            style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
                          >
                            {MODELS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-bold text-[var(--ink-primary)] tracking-tight">
                            {course.title}
                          </h3>
                          <div className="font-mono text-[11px] text-[var(--ink-faint)] mt-0.5 truncate">
                            {course.series_slug}
                            {course.track ? ` · track: ${course.track}` : ""}
                            {course.difficulty ? ` · ${course.difficulty}` : ""}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-[var(--ink-primary)] shrink-0 px-2 py-1 rounded border border-[var(--admin-table-border)] bg-[var(--surface-sunken)]">
                          {formatPriceCents(course.price_cents)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-4 text-[12px] text-[var(--ink-muted)]">
                        <span className="inline-flex items-center gap-1 font-mono text-[11.5px]">
                          📖 {publishedLessonCount ?? 0}
                          {typeof totalLessonCount === "number" && totalLessonCount > (publishedLessonCount ?? 0)
                            ? `/${totalLessonCount}`
                            : ""}{" "}
                          lessons
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11.5px]">
                          👥 {activeEntitlementCount} enrolled
                        </span>
                      </div>
                    </div>

                    <div
                      className="mt-5 pt-3.5 border-t flex flex-wrap items-center justify-between gap-2"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    >
                      <button
                        type="button"
                        onClick={() => viewCourseRoster(course.series_slug)}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        View Roster &rarr;
                      </button>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {course.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => setLaunching(course)}
                            className="rounded-lg text-white text-[11px] font-bold px-2.5 py-1 hover:opacity-90"
                            style={{ background: "var(--color-red)" }}
                          >
                            Launch &rarr;
                          </button>
                        )}
                        <Link
                          href={`/atlas/${course.series_slug}/preview`}
                          className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-primary)] bg-[var(--surface-sunken)] no-underline"
                          style={{ borderColor: "var(--admin-table-border)" }}
                        >
                          Preview
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditing(course)}
                          className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-card)]"
                          style={{ borderColor: "var(--admin-table-border)" }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ),
              )}
              {filteredRows.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-[var(--ink-muted)]">
                  No courses match the current filter.
                </div>
              )}
            </div>
          )}

          {/* TABLE VIEW */}
          {rows && viewMode === "table" && (
            <div
              className="rounded-xl border border-[var(--admin-table-border)] overflow-hidden bg-[var(--surface-card)]"
              style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
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
                                className="rounded-md border border-[var(--admin-table-border)] text-[12.5px] px-2 py-1.5 min-h-[44px] md:min-h-0 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden disabled:opacity-50 cursor-pointer"
                                style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
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
                                className="rounded-md border border-[var(--admin-table-border)] text-[12.5px] px-2 py-1.5 min-h-[44px] md:min-h-0 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-hidden disabled:opacity-50 cursor-pointer"
                                style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
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
                            <button
                              type="button"
                              onClick={() => viewCourseRoster(course.series_slug)}
                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[var(--ink-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--admin-selected-bg)] hover:text-[var(--color-red)] transition-colors cursor-pointer"
                              title="Manage course user roster"
                            >
                              <span>{activeEntitlementCount}</span>
                              <span className="text-[10px]">roster &rarr;</span>
                            </button>
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
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: STUDENT ROSTERS & ACCESS
          ========================================================================= */}
      {activeTab === "roster" && (
        <div>
          {effectiveData ? (
            <RosterPanel
              courses={effectiveData.courses}
              users={effectiveData.users}
              matrix={effectiveData.matrix}
              initialCourseSlugOrId={initialCourseParam}
              hideMatrix={true}
              onBulkGrant={onBulkGrant}
              onBulkRevoke={onBulkRevoke}
              onGrant={onGrant}
              onRevoke={onRevoke}
              onAdjust={onAdjust}
              onChangeAccessModel={onModelChange}
            />
          ) : effectiveLoading ? (
            <p role="status" className="text-sm text-gray-500 py-8 text-center">
              Loading student rosters…
            </p>
          ) : (
            <p role="status" className="text-sm text-red-600 py-8 text-center">
              {effectiveError ?? "Failed to load rosters"}
            </p>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: SECTIONS & LIBRARIES
          ========================================================================= */}
      {activeTab === "sections" && (
        <div className="space-y-4">
          <div
            className="flex items-center justify-between p-5 rounded-2xl border border-[var(--admin-table-border)] bg-[var(--surface-card)]"
            style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
          >
            <div>
              <h2 className="text-base font-bold text-[var(--ink-primary)]">
                Curriculum Structure &amp; Organization
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                Organize courses into hierarchical Sections and Groups for learner navigation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOrgDialogOpen(true)}
              className="rounded-lg px-3.5 py-1.5 text-xs font-bold text-white shadow-xs"
              style={{ background: "var(--color-navy)" }}
            >
              + Manage Sections &amp; Groups
            </button>
          </div>

          {loadingOrg ? (
            <p role="status" className="text-sm text-gray-500 py-8 text-center">
              Loading sections &amp; groups…
            </p>
          ) : sections.length === 0 ? (
            <div
              className="rounded-2xl border p-12 text-center bg-[var(--surface-card)]"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              <div className="text-3xl mb-2">🗂️</div>
              <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                No Sections or Groups configured yet
              </h3>
              <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-[400px] mx-auto">
                Sections allow you to cluster courses into broad disciplines (e.g. AI Engineering,
                Salesforce Architecture), and Groups organize them into topical series.
              </p>
              <button
                type="button"
                onClick={() => setOrgDialogOpen(true)}
                className="mt-4 rounded-lg px-4 py-2 text-xs font-bold text-white"
                style={{ background: "var(--color-navy)" }}
              >
                Configure First Section
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sections.map((section) => {
                const sectionGroups = groups.filter((g) => g.section_id === section.id);
                const matchingCourses = (rows ?? []).filter(
                  (r) =>
                    (r.course.track && r.course.track.toLowerCase() === section.slug.toLowerCase()) ||
                    (r.course.track && r.course.track.toLowerCase() === section.name.toLowerCase()),
                );

                return (
                  <div
                    key={section.id}
                    className="rounded-2xl border p-5 bg-[var(--surface-card)] flex flex-col justify-between"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
                          Order: {section.sort_order}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                          slug: {section.slug}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[var(--ink-primary)] mt-2">
                        {section.name}
                      </h3>

                      {/* Groups list */}
                      <div className="mt-4 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                          Groups ({sectionGroups.length})
                        </div>
                        {sectionGroups.length === 0 ? (
                          <div className="text-xs text-[var(--ink-muted)] italic">
                            No child groups yet
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {sectionGroups.map((g) => (
                              <span
                                key={g.id}
                                className="px-2.5 py-1 rounded-lg border text-xs font-medium bg-[var(--surface-sunken)]"
                                style={{ borderColor: "var(--admin-table-border)" }}
                              >
                                {g.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Associated courses */}
                      {matchingCourses.length > 0 && (
                        <div className="mt-4 pt-3 border-t text-xs text-[var(--ink-muted)]" style={{ borderColor: "var(--admin-table-border)" }}>
                          <span className="font-semibold text-[var(--ink-primary)]">{matchingCourses.length}</span> course(s) assigned to this section track
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-3 border-t flex justify-end" style={{ borderColor: "var(--admin-table-border)" }}>
                      <button
                        type="button"
                        onClick={() => setOrgDialogOpen(true)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit in Dialog &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: ACCESS MATRIX
          ========================================================================= */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          {effectiveData ? (
            <div
              className="rounded-2xl border border-[var(--admin-table-border)] overflow-hidden bg-[var(--surface-card)]"
              style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-3 border-b flex-wrap gap-2"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink-primary)]">
                    Cross-Product Matrix Grid
                  </span>
                  <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--ink-faint)]">
                    {effectiveData.users.filter((u) => u.status !== "tombstoned" && !u.deleted_at).length} learners &times; {effectiveData.courses.length} courses
                  </span>
                </div>
                <span className="font-mono text-[10.5px] text-[var(--ink-faint)]">
                  cell = effective access &middot; click cell to inspect &amp; act
                </span>
              </div>

              <AccessGrid
                users={effectiveData.users.filter((u) => u.status !== "tombstoned" && !u.deleted_at)}
                courses={effectiveData.courses}
                matrix={effectiveData.matrix}
                onGrant={onGrant}
                onRevoke={onRevoke}
                onAdjust={async (userId, courseId) => {
                  const user = effectiveData.users.find((u) => u.user_id === userId);
                  const src = user?.entitlements[courseId];
                  const to = src === "granted" ? "one-time" : "granted";
                  await onAdjust(userId, courseId, src ?? "granted", to);
                }}
              />

              <div
                className="flex flex-wrap gap-4 px-5 py-3 font-mono text-[10.5px] text-[var(--ink-faint)] border-t bg-[var(--surface-sunken)]/40"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--access-granted)" }} />
                  Granted
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--access-one-time)" }} />
                  One-time
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--access-subscribed)" }} />
                  Subscribed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--access-free)" }} />
                  Free
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--access-none)" }} />
                  None &mdash; locked
                </span>
              </div>
            </div>
          ) : effectiveLoading ? (
            <p role="status" className="text-sm text-gray-500 py-8 text-center">
              Loading access matrix…
            </p>
          ) : (
            <p role="status" className="text-sm text-red-600 py-8 text-center">
              {effectiveError ?? "Failed to load matrix"}
            </p>
          )}
        </div>
      )}

      {/* Dialogs */}
      {launching && (
        <LaunchDialog
          course={launching}
          onClose={() => setLaunching(null)}
          onLaunched={() => {
            setLaunching(null);
            void Promise.all([refreshCourses(), refreshEffective?.()]);
          }}
          onToast={(msg) => setToast({ text: msg })}
        />
      )}

      {editing && rows && (
        <CourseProfileDialog
          course={editing}
          allCourses={rows.map((r) => r.course)}
          onClose={() => setEditing(null)}
          onSaved={() => void Promise.all([refreshCourses(), refreshEffective?.()])}
          onToast={(msg) => setToast({ text: msg })}
        />
      )}

      {orgDialogOpen && (
        <CatalogOrgDialog
          onClose={() => {
            setOrgDialogOpen(false);
            if (activeTab === "sections") void loadSectionsAndGroups();
          }}
          onToast={(msg) => setToast({ text: msg })}
        />
      )}
    </div>
  );
}

export default function AdminCoursesPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-gray-500 py-6">
          Loading courses…
        </p>
      }
    >
      <AdminCoursesContent />
    </Suspense>
  );
}
