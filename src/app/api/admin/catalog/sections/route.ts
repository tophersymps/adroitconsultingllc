/**
 * /api/admin/catalog/sections — Learn v2 catalog section management (ADR-206).
 *   GET  — list all sections (for the admin course form).
 *   POST — upsert a section by slug (AdminSectionUpsertRequest). Admin-only;
 *          every write is audited (course.profile_change / section.upsert).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import { writeAuditLog } from "@/lib/admin";
import type {
  AdminSectionUpsertRequest,
  CatalogSection,
} from "@/shared/contracts-course-catalog";

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("catalog_sections")
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

  let body: AdminSectionUpsertRequest;
  try {
    body = (await req.json()) as AdminSectionUpsertRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
      .from("catalog_sections")
      .upsert(
        {
          slug: body.slug,
          name: body.name,
          sort_order: body.sort_order ?? 0,
        },
        { onConflict: "slug" },
      )
      .select("*")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "course.profile_change",
      targetType: "catalog_section",
      targetId: body.slug,
      details: { upsert: { name: body.name, sort_order: body.sort_order ?? 0 } },
    });

    return NextResponse.json({ ok: true, data: data as CatalogSection });
  } catch (err) {
    console.error("[admin] upsert section", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
