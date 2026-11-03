"use client";

import { useState } from "react";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import { RosterPanel } from "@/components/Admin/RosterPanel";
import AdminToast, { type AdminToastMessage } from "@/components/Admin/AdminToast";
import type { AccessModel } from "@/shared/contracts-course-catalog";

/**
 * /admin/access/courses — Access · Courses (course-first roster, ADR-222).
 * Pick a course, see who has effective access (five-state chips), and
 * grant/revoke in bulk. Change the access model inline here and the roster
 * immediately reflects how the seam re-resolves each user.
 */
export default function AdminAccessCoursesPage() {
  const { data, loading, error, refresh } = useAdminAccessEffective();
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const [initialCourseParam] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("course");
    } catch {
      return null;
    }
  });

  async function onBulkGrant(
    userIds: string[],
    courseId: string,
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds, courseId }),
      });
      const ok = res.ok;
      if (ok) await refresh?.();
      setToast({
        text: ok
          ? `Bulk granted ${userIds.length} user(s)`
          : "Bulk grant failed",
        tone: ok ? "success" : "error",
      });
      return ok;
    } catch {
      setToast({ text: "Bulk grant failed", tone: "error" });
      return false;
    }
  }

  async function onBulkRevoke(
    userIds: string[],
    courseId: string,
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements/bulk", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds, courseId }),
      });
      const ok = res.ok;
      if (ok) await refresh?.();
      setToast({
        text: ok
          ? `Bulk revoked ${userIds.length} user(s)`
          : "Bulk revoke failed",
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
        await refresh?.();
        setToast({ text: "Granted", tone: "success" });
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
        await refresh?.();
        setToast({ text: "Revoked", tone: "success" });
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
    const ok = await onGrantSource(userId, courseId, to);
    if (ok) {
      await refresh?.();
      setToast({ text: `Adjusted ${from} → ${to}`, tone: "success" });
    } else {
      setToast({ text: "Adjust failed", tone: "error" });
    }
    return ok;
  }

  async function onGrantSource(
    userId: string,
    courseId: string,
    source: "granted" | "one-time",
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, courseId, source }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function onChangeAccessModel(
    seriesSlug: string,
    nextModel: AccessModel,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/courses/${seriesSlug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_model: nextModel }),
      });
      const ok = res.ok;
      if (ok) {
        await refresh?.();
        setToast({
          text: `Updated ${seriesSlug} access model → ${nextModel}`,
          tone: "success",
        });
      } else {
        setToast({
          text: "Failed to update course access model",
          tone: "error",
        });
      }
      return ok;
    } catch {
      setToast({
        text: "Failed to update course access model",
        tone: "error",
      });
      return false;
    }
  }

  if (loading && !data) {
    return (
      <p role="status" className="text-sm text-gray-500">
        Loading courses…
      </p>
    );
  }
  if (error) {
    return (
      <p role="status" className="text-sm text-red-600">
        {error}
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            Courses
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 max-w-[760px]">
            Course-first lens — pick a course, see who has access, and
            grant/revoke in bulk. Change the access model here and the roster
            immediately reflects how the access seam re-resolves each user.
          </p>
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      {data && (
        <RosterPanel
          courses={data.courses}
          users={data.users}
          matrix={data.matrix}
          initialCourseSlugOrId={initialCourseParam}
          onBulkGrant={onBulkGrant}
          onBulkRevoke={onBulkRevoke}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onAdjust={onAdjust}
          onChangeAccessModel={onChangeAccessModel}
        />
      )}
    </div>
  );
}
