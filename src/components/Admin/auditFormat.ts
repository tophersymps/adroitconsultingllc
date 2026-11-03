import type {
  AdminCourseListRow,
  AdminUserListRow,
} from "@/shared/contracts-course-catalog";

export const AUDIT_ACTION_TAG: Record<string, string> = {
  "course.launch": "LAUNCH",
  "course.status_change": "STATUS",
  "course.access_model_change": "MODEL",
  "course.price_change": "PRICE",
  "course.profile_change": "PROFILE",
  "course.provision": "CREATE",
  "role.assign": "SET_ROLE",
  "entitlement.grant": "GRANT",
  "entitlement.revoke": "REVOKE",
  "entitlement.bulk_grant": "BULK_GRANT",
  "entitlement.bulk_revoke": "BULK_REVOKE",
  "entitlement.adjust": "ADJUST",
  "user.create": "USER_CREATE",
  "user.password_reset": "PWD_RESET",
  "user.freeze": "FREEZE",
  "user.unfreeze": "UNFREEZE",
  "user.delete_soft": "DELETE_SOFT",
  "user.delete_hard": "DELETE_HARD",
  "user.restore": "RESTORE",
};

export function resolveAuditActorLabel(
  actorUserId: string | null | undefined,
  usersById: Map<string, AdminUserListRow>,
): string {
  if (!actorUserId) return "system";
  const u = usersById.get(actorUserId);
  if (u) {
    return u.display_name ? `${u.display_name} (${u.email})` : u.email;
  }
  return actorUserId.length > 12 ? `${actorUserId.slice(0, 8)}…` : actorUserId;
}

export function resolveAuditTargetLabel(
  entry: {
    target_type: string;
    target_id: string | null;
    details?: Record<string, unknown> | null;
  },
  usersById: Map<string, AdminUserListRow>,
  coursesById: Map<string, AdminCourseListRow>,
  coursesBySlug: Map<string, AdminCourseListRow>,
): string {
  const { target_type, target_id, details } = entry;
  if (!target_id) return target_type;

  if (target_type === "user") {
    const u = usersById.get(target_id);
    if (u) return `${u.email}`;
    const detailEmail =
      details && typeof details.email === "string" ? details.email : null;
    if (detailEmail) return `${detailEmail} (${target_id.slice(0, 8)}…)`;
    return `user · ${target_id.slice(0, 8)}…`;
  }

  if (target_type === "course") {
    const bySlug = coursesBySlug.get(target_id);
    if (bySlug) return `${bySlug.course.title} (${bySlug.course.series_slug})`;
    const byId = coursesById.get(target_id);
    if (byId) return `${byId.course.title} (${byId.course.series_slug})`;
    return `course · ${target_id}`;
  }

  if (target_type === "entitlement") {
    if (target_id.includes(":")) {
      const [userId, courseId] = target_id.split(":");
      const u = userId ? usersById.get(userId) : undefined;
      const c = courseId
        ? (coursesById.get(courseId) ?? coursesBySlug.get(courseId))
        : undefined;
      const userLabel = u ? u.email : `${(userId ?? "").slice(0, 8)}…`;
      const courseLabel = c
        ? c.course.title || c.course.series_slug
        : `${(courseId ?? "").slice(0, 8)}…`;
      return `${userLabel} → ${courseLabel}`;
    }
    const c = coursesById.get(target_id) ?? coursesBySlug.get(target_id);
    if (c) return `bulk · ${c.course.title || c.course.series_slug}`;
  }

  return `${target_type} · ${target_id.slice(0, 36)}`;
}
