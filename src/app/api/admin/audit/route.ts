/**
 * GET /api/admin/audit — admin audit log (US-015). Read-only view of
 * admin_audit_log rows, newest first. Admin-only.
 *
 * v4 (t_0ed19ad0): optional `action` and `actor` filters (server-side, via
 * the service client) so the audit page can filter by action type + user.
 * The CSV export is generated client-side from the filtered rows.
 * Contract: AdminAuditLogRow.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AdminAuditLogRow } from "@/shared/contracts-course-catalog";

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);
  const action = (req.nextUrl.searchParams.get("action") ?? "").trim();
  const actor = (req.nextUrl.searchParams.get("actor") ?? "").trim();

  try {
    const service = getSupabaseServiceClient();
    let query = service
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action) query = query.eq("action", action);
    if (actor) query = query.eq("actor_user_id", actor);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, data: (data ?? []) as AdminAuditLogRow[] });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
