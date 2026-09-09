/**
 * GET /api/admin/users/[id] — admin user detail (US-010/014): role + active
 * entitlements (keyed by course_id → source) for the user matrix. Admin-only.
 * Contract: AdminUserListRow (entitlements populated).
 */
import { NextResponse } from "next/server";
import { activeSubscriptionOf, requireAdminApi, notFoundJson } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/supabase/auth-admin";
import type {
  AdminUserListRow,
  EntitlementSource,
  SubscriptionRow,
  UserRole,
} from "@/shared/contracts-course-catalog";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  try {
    const service = getSupabaseServiceClient();
    // Auth user comes from the GoTrue Admin API (`auth` schema not exposed to
    // PostgREST). null → 404 (matches old `.maybeSingle()` semantics).
    const [user, roleRes, profileRes, entRes, subRes] = await Promise.all([
      getAuthUser(id),
      service
        .from("user_roles")
        .select("role")
        .eq("user_id", id)
        .maybeSingle(),
      service
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", id)
        .maybeSingle(),
      service
        .from("user_entitlements")
        .select("course_id, source")
        .eq("user_id", id)
        .is("revoked_at", null),
      service
        .from("subscriptions")
        .select("id, plan, status, current_period_end, created_at")
        .eq("user_id", id),
    ]);
    if (!user) return notFoundJson();

    const entitlements: Record<string, EntitlementSource> = {};
    for (const e of (entRes.data ?? []) as {
      course_id: string;
      source: EntitlementSource;
    }[]) {
      entitlements[e.course_id] = e.source;
    }

    const subscription = activeSubscriptionOf(
      (subRes.data ?? []) as SubscriptionRow[],
      new Date().toISOString(),
    );

    const row: AdminUserListRow = {
      user_id: id,
      email: user.email,
      display_name:
        ((profileRes.data as { display_name: string | null } | null)
          ?.display_name) ?? null,
      role: ((roleRes.data as { role: UserRole } | null)?.role) ?? "member",
      entitlements,
      subscription,
    };
    return NextResponse.json({ ok: true, data: row });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
