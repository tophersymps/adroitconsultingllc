/**
 * GET /api/admin/access/effective — consolidated five-state accessor read
 * (ADR-223). One round-trip that powers the AccessGrid, People panel, Courses
 * roster, and Access Overview: live courses + every user's entitlements +
 * active subscription + the resolved effective-access matrix + the subscriber
 * pulse. Admin-only, read-only (no writes, no audit log).
 *
 * Contract: AdminAccessEffectiveResponse (shape below). Reuses
 * AdminCourseListRow + AdminUserListRow (the latter carries .subscription from
 * PR #170 — no duplication). The matrix is resolved by the pure
 * effectiveAccessState seam (ADR-220) so the panel always agrees with the gate.
 */
import { NextResponse } from "next/server";
import { activeSubscriptionOf, requireAdminApi } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { listAuthUsers } from "@/lib/supabase/auth-admin";
import { effectiveAccessState } from "@/lib/access";
import type {
  AdminCourseListRow,
  AdminUserListRow,
  CourseRow,
  EntitlementSource,
  SubscriptionRow,
  UserEntitlementRow,
  UserRole,
} from "@/shared/contracts-course-catalog";

export type EffectiveAccessState =
  | "granted"
  | "one-time"
  | "subscribed"
  | "free"
  | "none";

export interface AdminAccessEffectiveResponse {
  ok: true;
  data: {
    courses: AdminCourseListRow[];
    users: AdminUserListRow[];
    /** users[].user_id → courses[].course.id → five-state effective access. */
    matrix: Record<string, Record<string, EffectiveAccessState>>;
    subscriberPulse: {
      active: number;
      trialing: number;
      canceled: number;
      past_due: number;
    };
  };
}

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const service = getSupabaseServiceClient();
    const [authUsers, coursesRes, rolesRes, profilesRes, entRes, subsRes] =
      await Promise.all([
        listAuthUsers(),
        service.from("courses").select("*").order("created_at", { ascending: true }),
        service.from("user_roles").select("user_id, role"),
        service.from("user_profiles").select("user_id, display_name"),
        service
          .from("user_entitlements")
          .select("*")
          .is("revoked_at", null),
        service
          .from("subscriptions")
          .select("user_id, id, plan, status, current_period_end, created_at"),
      ]);
    if (coursesRes.error) throw coursesRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (entRes.error) throw entRes.error;
    if (subsRes.error) throw subsRes.error;

    const courses = (coursesRes.data ?? []) as CourseRow[];
    const roleByUser = new Map<string, UserRole>();
    for (const r of (rolesRes.data ?? []) as { user_id: string; role: UserRole }[]) {
      roleByUser.set(r.user_id, r.role);
    }
    const nameByUser = new Map<string, string | null>();
    for (const p of (profilesRes.data ?? []) as {
      user_id: string;
      display_name: string | null;
    }[]) {
      nameByUser.set(p.user_id, p.display_name);
    }
    const entsByUser = new Map<string, UserEntitlementRow[]>();
    for (const e of (entRes.data ?? []) as UserEntitlementRow[]) {
      const list = entsByUser.get(e.user_id) ?? [];
      list.push(e);
      entsByUser.set(e.user_id, list);
    }
    const subsByUser = new Map<string, SubscriptionRow[]>();
    for (const s of (subsRes.data ?? []) as SubscriptionRow[]) {
      const list = subsByUser.get(s.user_id) ?? [];
      list.push(s);
      subsByUser.set(s.user_id, list);
    }
    const now = new Date().toISOString();

    // Entitlement count per course (reuse the /api/admin/courses shape).
    const countByCourse = new Map<string, number>();
    for (const e of (entRes.data ?? []) as UserEntitlementRow[]) {
      countByCourse.set(e.course_id, (countByCourse.get(e.course_id) ?? 0) + 1);
    }

    const courseRows: AdminCourseListRow[] = courses.map((course) => ({
      course,
      activeEntitlementCount: countByCourse.get(course.id) ?? 0,
    }));

    const userRows: AdminUserListRow[] = authUsers.map((u) => {
      const entitlements: Record<string, EntitlementSource> = {};
      for (const e of entsByUser.get(u.id) ?? []) {
        entitlements[e.course_id] = e.source;
      }
      return {
        user_id: u.id,
        email: u.email,
        display_name: nameByUser.get(u.id) ?? null,
        role: roleByUser.get(u.id) ?? ("member" as UserRole),
        entitlements,
        subscription: activeSubscriptionOf(subsByUser.get(u.id) ?? [], now),
      };
    });

    // Resolve the five-state matrix — every user × live course through the seam.
    const matrix: Record<string, Record<string, EffectiveAccessState>> = {};
    for (const user of userRows) {
      const entitlements = entsByUser.get(user.user_id) ?? [];
      const subscriptions = subsByUser.get(user.user_id) ?? [];
      const row: Record<string, EffectiveAccessState> = {};
      for (const course of courses) {
        row[course.id] = effectiveAccessState({
          course,
          entitlements,
          subscriptions,
          now,
        });
      }
      matrix[user.user_id] = row;
    }

    // Subscriber pulse — counts by status for the Overview (read-only).
    const pulse = { active: 0, trialing: 0, canceled: 0, past_due: 0 };
    for (const s of (subsRes.data ?? []) as SubscriptionRow[]) {
      if (s.status === "active") pulse.active += 1;
      else if (s.status === "trialing") pulse.trialing += 1;
      else if (s.status === "canceled") pulse.canceled += 1;
      else if (s.status === "past_due") pulse.past_due += 1;
    }

    return NextResponse.json({
      ok: true,
      data: {
        courses: courseRows,
        users: userRows,
        matrix,
        subscriberPulse: pulse,
      },
    } satisfies AdminAccessEffectiveResponse);
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
