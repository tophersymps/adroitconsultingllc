"use client";

import { useState } from "react";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import { RosterPanel } from "@/components/Admin/RosterPanel";

/**
 * /admin/access/courses — Access · Courses (course-first roster, ADR-222).
 * Pick a course, see who has effective access (five-state chips), and
 * grant/revoke in bulk. Change the access model here and the roster reflects
 * how the seam re-resolves each user. New page, gated by the /admin layout.
 */
export default function AdminAccessCoursesPage() {
  const { data, loading, error } = useAdminAccessEffective();
  const [toast, setToast] = useState<string | null>(null);

  async function onBulkGrant(userIds: string[], courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds, courseId }),
      });
      const ok = res.ok;
      setToast(ok ? `Bulk granted ${userIds.length} user(s)` : "Bulk grant failed");
      return ok;
    } catch {
      setToast("Bulk grant failed");
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
      setToast(ok ? `Bulk revoked ${userIds.length} user(s)` : "Bulk revoke failed");
      return ok;
    } catch {
      setToast("Bulk revoke failed");
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
      if (ok) setToast("Granted");
      return ok;
    } catch {
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
      if (ok) setToast("Revoked");
      return ok;
    } catch {
      return false;
    }
  }

  async function onAdjust(
    userId: string,
    courseId: string,
    from: "granted" | "one-time",
    to: "granted" | "one-time",
  ): Promise<boolean> {
    // Adjust = revoke then regrant under the new source (one composite action).
    const revoked = await onRevoke(userId, courseId);
    if (!revoked) return false;
    const ok = await onGrantSource(userId, courseId, to);
    if (ok) setToast(`Adjusted ${from} → ${to}`);
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

  if (loading && !data) {
    return <p role="status" className="text-sm text-gray-500">Loading courses…</p>;
  }
  if (error) {
    return <p role="status" className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">Courses</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 max-w-[760px]">
            Course-first lens — pick a course, see who has access, and
            grant/revoke in bulk. Change the access model here and the roster
            immediately reflects how the access seam re-resolves each user.
          </p>
        </div>
        {toast && (
          <span role="status" aria-live="polite" className="text-[12.5px] font-medium text-emerald-700 bg-emerald/10 px-3 py-1.5 rounded-full">
            {toast}
          </span>
        )}
      </div>

      {data && (
        <RosterPanel
          courses={data.courses}
          users={data.users}
          matrix={data.matrix}
          onBulkGrant={onBulkGrant}
          onBulkRevoke={onBulkRevoke}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onAdjust={onAdjust}
        />
      )}
    </div>
  );
}
