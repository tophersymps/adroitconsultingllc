/**
 * GET /api/admin/access/effective — consolidated five-state accessor read
 * (ADR-223). One round-trip that powers the AccessGrid, People panel, Courses
 * roster, and Access Overview: live courses + every user's entitlements +
 * active subscription + lifecycle metadata + the resolved effective-access
 * matrix + the subscriber pulse. Admin-only, read-only (no writes, no audit log).
 *
 * Contract: AdminAccessEffectiveResponse (shape below). Reuses
 * AdminCourseListRow + AdminUserListRow (the latter carries .subscription from
 * PR #170 — no duplication). The matrix is resolved by the pure
 * effectiveAccessState seam (ADR-220) so the panel always agrees with the gate.
 */
import { NextResponse } from "next/server";
import { activeSubscriptionOf, requireAdminApi } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import * as authUsersModule from "@/lib/auth/users";
import { effectiveAccessState } from "@/lib/access";
import { getAllSeries } from "@/lib/learn";
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
    const service = await getSupabaseServerClient();
    const [authUsers, coursesRes, rolesRes, profilesRes, entRes, subsRes] =
      await Promise.all([
        authUsersModule.listAuthUsers(),
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

    // Optional enrichment: lifecycle metadata (email_verified, provider,
    // sessions, frozen/tombstoned status) and lesson completion counts.
    const [lifecycleList, completionsRes] = await Promise.all([
      (async () => {
        try {
          const fn = authUsersModule.listAdminUserDetails;
          return typeof fn === "function" ? await fn() : [];
        } catch {
          return [];
        }
      })(),
      Promise.resolve(
        service.from("lesson_completion")?.select?.("user_id"),
      ).catch(() => ({ data: [], error: null })),
    ]);

    const lifecycleByUser = new Map(
      (lifecycleList ?? []).map((item) => [item.id, item]),
    );
    const completionCountByUser = new Map<string, number>();
    for (const c of ((completionsRes as { data?: { user_id: string }[] } | null)?.data ?? [])) {
      if (c?.user_id) {
        completionCountByUser.set(
          c.user_id,
          (completionCountByUser.get(c.user_id) ?? 0) + 1,
        );
      }
    }

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

    // Entitlement count + disk lesson counts per course.
    const countByCourse = new Map<string, number>();
    for (const e of (entRes.data ?? []) as UserEntitlementRow[]) {
      countByCourse.set(e.course_id, (countByCourse.get(e.course_id) ?? 0) + 1);
    }
    const diskBySlug = new Map(getAllSeries().map((s) => [s.slug, s]));

    const courseRows: AdminCourseListRow[] = courses.map((course) => {
      const series = diskBySlug.get(course.series_slug);
      return {
        course,
        activeEntitlementCount: countByCourse.get(course.id) ?? 0,
        publishedLessonCount: series?.lessons.length ?? 0,
        totalLessonCount: series?.totalLessons ?? series?.lessons.length ?? 0,
      };
    });

    // Combine live auth users with any tombstoned users from lifecycleList
    const combinedUsers: { id: string; email: string }[] = [...(authUsers ?? [])];
    const seenIds = new Set(combinedUsers.map((u) => u.id));
    for (const detail of lifecycleList ?? []) {
      if (!seenIds.has(detail.id)) {
        combinedUsers.push({ id: detail.id, email: detail.email });
        seenIds.add(detail.id);
      }
    }

    const userRows: AdminUserListRow[] = combinedUsers.map((u) => {
      const entitlements: Record<string, EntitlementSource> = {};
      for (const e of entsByUser.get(u.id) ?? []) {
        entitlements[e.course_id] = e.source;
      }
      const detail = lifecycleByUser.get(u.id);
      const profileName = nameByUser.get(u.id) ?? detail?.name ?? null;
      return {
        user_id: u.id,
        email: u.email || detail?.email || "",
        display_name: profileName,
        role: roleByUser.get(u.id) ?? ("member" as UserRole),
        entitlements,
        subscription: activeSubscriptionOf(subsByUser.get(u.id) ?? [], now),
        ...(detail
          ? {
              email_verified: detail.emailVerified,
              provider: detail.provider,
              created_at: detail.createdAt,
              last_seen_at: detail.lastSeenAt,
              active_session_count: detail.activeSessionCount,
              frozen_at: detail.frozenAt,
              frozen_reason: detail.frozenReason,
              deleted_at: detail.deletedAt,
              status: detail.status,
            }
          : {}),
        lessons_completed_count: completionCountByUser.get(u.id) ?? 0,
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
  } catch (err) {
    console.error("[admin-access-effective] failed to load effective access", {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
