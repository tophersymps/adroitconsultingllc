/**
 * /api/admin/catalog/groups — Learn v2 catalog group management (ADR-206).
 *   GET  — list all groups (for the admin course form).
 *   POST — upsert a group by (section_id, slug) (AdminGroupUpsertRequest).
 *          Admin-only; every write is audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, writeAuditLog } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import type {
  AdminGroupUpsertRequest,
  CatalogGroup,
} from "@/shared/contracts-course-catalog";

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("catalog_groups")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: AdminGroupUpsertRequest;
  try {
    body = (await req.json()) as AdminGroupUpsertRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.section_id !== "string" || !body.section_id) {
    return NextResponse.json({ error: "section_id required" }, { status: 400 });
  }
  if (typeof body.slug !== "string" || !body.slug.trim() || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "slug and name required" }, { status: 400 });
  }
  if (body.sort_order !== undefined && (!Number.isInteger(body.sort_order) || body.sort_order < 0)) {
    return NextResponse.json({ error: "Invalid sort_order" }, { status: 400 });
  }

  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("catalog_groups")
      .upsert(
        {
          section_id: body.section_id,
          slug: body.slug,
          name: body.name,
          sort_order: body.sort_order ?? 0,
        },
        { onConflict: "section_id,slug" },
      )
      .select("*")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "course.profile_change",
      targetType: "catalog_group",
      targetId: body.slug,
      details: {
        upsert: {
          section_id: body.section_id,
          name: body.name,
          sort_order: body.sort_order ?? 0,
        },
      },
    });

    return NextResponse.json({ ok: true, data: data as CatalogGroup });
  } catch (err) {
    console.error("[admin] upsert group", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
