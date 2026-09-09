"use client";

import { useState } from "react";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import { useAdminUsers } from "@/lib/hooks/useAdminUsers";
import { AccessPanel } from "@/components/Admin/AccessPanel";
import type { EntitlementSource, UserRole } from "@/shared/contracts-course-catalog";

/**
 * /admin/users — Access · People (person-first lens, ADR-222). Replaces the
 * crude per-row course dropdown + matrix with the AccessPanel: search a person,
 * see their full effective access (five-state chips per course), and grant /
 * revoke / adjust inline. Every write records an admin_audit_log row.
 */
export default function AdminUsersPage() {
  const { data, loading, error } = useAdminAccessEffective();
  const { setRole, grant, revoke, adjustSource } = useAdminUsers();
  const [toast, setToast] = useState<string | null>(null);

  async function onSetRole(userId: string, role: UserRole): Promise<boolean> {
    const ok = await setRole(userId, role);
    setToast(ok ? "Role updated" : "Role update failed");
    return ok;
  }

  async function onGrant(userId: string, courseId: string, source: "granted" | "one-time"): Promise<boolean> {
    const ok = await grant({ userId, courseId, source });
    setToast(ok ? `Granted ${source === "one-time" ? "one-time" : "access"}` : "Grant failed");
    return ok;
  }

  async function onRevoke(userId: string, courseId: string): Promise<boolean> {
    const ok = await revoke(userId, courseId);
    setToast(ok ? "Revoked" : "Revoke failed");
    return ok;
  }

  async function onAdjust(userId: string, courseId: string, from: EntitlementSource, to: EntitlementSource): Promise<boolean> {
    const ok = await adjustSource({ userId, courseId, from, to });
    setToast(ok ? `Adjusted ${from} → ${to}` : "Adjust failed");
    return ok;
  }

  if (loading && !data) {
    return <p role="status" className="text-sm text-gray-500">Loading people…</p>;
  }
  if (error) {
    return <p role="status" className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">People</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 max-w-[760px]">
            Person-first lens — search, select a person, and see their full
            effective access. Each course row IS the affordance: grant, adjust
            or revoke without a dropdown. Every write records an audit row.
          </p>
        </div>
        {toast && (
          <span role="status" aria-live="polite" className="text-[12.5px] font-medium text-emerald-700 bg-emerald/10 px-3 py-1.5 rounded-full">
            {toast}
          </span>
        )}
      </div>

      {data && (
        <AccessPanel
          users={data.users}
          courses={data.courses}
          matrix={data.matrix}
          onSetRole={onSetRole}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onAdjust={onAdjust}
        />
      )}
    </div>
  );
}
