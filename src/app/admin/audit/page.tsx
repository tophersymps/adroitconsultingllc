"use client";

import { useMemo, useState } from "react";
import { useAdminAudit } from "@/lib/hooks/useAdminAudit";

/** /admin/audit (US-015, v4 t_0ed19ad0) — read-only audit log with filters
 * (action type + acting user) and CSV export. Server-side filtering via the
 * audit API; export is generated client-side from the filtered rows. */
export default function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const { rows, loading, error, refresh } = useAdminAudit(500, {
    action: action || undefined,
    actor: actor || undefined,
  });

  const current = useMemo(() => rows ?? [], [rows]);

  // Distinct filter options from the loaded set (small log — fine to derive).
  const actionOptions = useMemo(
    () => Array.from(new Set(current.map((r) => r.action))).sort(),
    [current],
  );
  const actorOptions = useMemo(
    () =>
      Array.from(new Set(current.map((r) => r.actor_user_id ?? "system"))).sort(),
    [current],
  );

  function exportCsv() {
    const header = ["id", "time", "actor_user_id", "action", "target_type", "target_id", "details"];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = current.map((r) =>
      [
        r.id,
        r.created_at,
        r.actor_user_id ?? "",
        r.action,
        r.target_type,
        r.target_id ?? "",
        r.details ? JSON.stringify(r.details) : "",
      ]
        .map(esc)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            Audit Log
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
            Every launch, status/access-model change, role assignment, and
            grant/revoke.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filter by action"
            className="rounded-md border text-[12.5px] px-2 py-1.5 bg-transparent"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            aria-label="Filter by actor"
            className="rounded-md border text-[12.5px] px-2 py-1.5 bg-transparent"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            <option value="">All actors</option>
            {actorOptions.map((a) => (
              <option key={a} value={a === "system" ? "system" : a}>
                {a}
              </option>
            ))}
          </select>
          <button
            onClick={refresh}
            className="rounded-md border text-[12px] font-semibold px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={current.length === 0}
            className="rounded-md text-[12px] font-semibold px-3 py-1.5 text-white disabled:opacity-45"
            style={{ background: "var(--color-red)" }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading && !rows && (
        <p role="status" className="text-sm text-gray-500">
          Loading audit log…
        </p>
      )}
      {error && (
        <p role="status" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {rows && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)" }}>
          {/* Table retained at sm+; below sm rows reflow to label → value
              cards (ADR-232) so the read-only log stays readable with no
              horizontal page-scroll. */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="font-mono text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--admin-table-head)" }}>
                  <th scope="col" className="px-4 py-3">Time</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Target</th>
                  <th scope="col" className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr key={r.id} className="text-[13px] align-top" style={{ borderTop: "1px solid var(--admin-table-border)" }}>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-[var(--ink-muted)]">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-[var(--ink-muted)]">
                      {r.actor_user_id?.slice(0, 8) ?? "system"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11.5px] font-semibold rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-[var(--ink-muted)]">
                      {r.target_type}
                      {r.target_id ? ` · ${r.target_id.slice(0, 36)}` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--ink-muted)] max-w-[280px] truncate">
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Card-stack view — only below sm (ADR-232) */}
          <ul className="sm:hidden" aria-label="Audit log (mobile view)">
            {current.map((r) => (
              <li
                key={r.id}
                className="px-4 py-3.5 border-b"
                style={{ borderBottom: "1px solid var(--border-subtle, #F3F4F6)" }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11.5px] font-semibold rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                    {r.action}
                  </span>
                  <span className="ml-auto font-mono text-[10.5px] text-[var(--ink-muted)]">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <dl className="flex flex-col gap-1.5 mt-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--ink-muted)]">Actor</dt>
                    <dd className="font-mono text-[var(--ink-primary)] font-medium">
                      {r.actor_user_id?.slice(0, 8) ?? "system"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--ink-muted)]">Target</dt>
                    <dd className="font-mono text-[var(--ink-primary)] font-medium truncate">
                      {r.target_type}
                      {r.target_id ? ` · ${r.target_id.slice(0, 36)}` : ""}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--ink-muted)]">Details</dt>
                    <dd className="font-mono text-[var(--ink-primary)] font-medium truncate">
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {current.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">
              No audit entries match the current filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
