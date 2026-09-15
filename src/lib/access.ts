/**
 * src/lib/access.ts — the server-side access seam (ADR-201).
 *
 * THE single decision function every surface calls: catalog pages, content
 * pages, sitemap, static params, progress/continue-learning APIs, and the
 * admin backend. The seam turns `courses`/`user_roles`/`user_entitlements`/
 * `subscriptions` rows into visibility + access decisions.
 *
 * SECURITY MODEL (ADR-202): the seam is the AUTHORITATIVE gate; Supabase RLS
 * is defense-in-depth. Reads use the cookie-bound server client so RLS scopes
 * rows to the real user; the pure decision core below enforces the exact same
 * rules independently so unit tests can verify behaviour without a live DB.
 *
 * Decision rules (mirror US-002 exactly, see arch §3):
 *  - isAdmin:          user_roles row role='admin'. Null → false.
 *  - decideCourseAccess:
 *      1. no courses row by series_slug → not-launched
 *      2. admin → admin-preview (pending/archived render for admins)
 *      3. not live (non-admin) → not-launched
 *      4. live → evaluate access_model against entitlements/subscriptions
 *      5. live + not entitled → paywall
 *  - getCatalogForUser: live visible to all; pending/archived additionally to
 *    admins; each entry carries canAccess.
 *
 * Contract types: src/shared/contracts-course-catalog.ts (brainiac, t_22b26cb9).
 */
import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AccessModel,
  AccessSeam,
  CatalogCourseEntry,
  CatalogForUserResult,
  CatalogGroup,
  CatalogSection,
  CourseAccessDecision,
  CoursePrerequisiteRow,
  CourseRow,
  SubscriptionRow,
  UserEntitlementRow,
  UserId,
  UserRole,
} from "@/shared/contracts-course-catalog";

/* ------------------------------------------------------------------ */
/*  Pure decision core (unit-tested without a DB)                     */
/* ------------------------------------------------------------------ */

/** Rows relevant to ONE user's access decision. */
export interface AccessInput {
  /** True when the caller is an admin. */
  isAdmin: boolean;
  /** All course rows the caller may see (RLS already scopes members → live). */
  courses: CourseRow[];
  /** The caller's active (non-revoked) entitlements. */
  entitlements: UserEntitlementRow[];
  /** The caller's active subscriptions (any status — filtered in helper). */
  subscriptions: SubscriptionRow[];
  /** "now" as ISO-8601 — injectable for deterministic tests. */
  now: string;
}

/** True when a subscription row currently grants access (active/trialing + in future). */
export function activeSubGrantsAccess(
  sub: SubscriptionRow,
  now: string,
): boolean {
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (!sub.current_period_end) return true; // open-ended active subscription
  return sub.current_period_end > now;
}

/** True when the user holds an active `granted` entitlement for THIS course. */
export function hasGrantedEntitlementFor(
  courseId: string,
  entitlements: UserEntitlementRow[],
): boolean {
  return entitlements.some(
    (e) => e.source === "granted" && e.course_id === courseId,
  );
}

/** True when a live course's access_model grants the user access. */
export function courseGrantsAccess(
  model: AccessModel,
  entitlements: UserEntitlementRow[],
  subscriptions: SubscriptionRow[],
  now: string,
  courseId: string,
): boolean {
  switch (model) {
    case "free":
      // Free = granted to everyone, guests included (preserves public lessons).
      return true;
    case "granted":
      // Scope to a matching granted entitlement for THIS course (v4 stealth).
      return hasGrantedEntitlementFor(courseId, entitlements);
    case "one-time":
      return entitlements.some(
        (e) => e.source === "one-time" && e.course_id === courseId,
      );
    case "subscription":
      return subscriptions.some((s) => activeSubGrantsAccess(s, now));
    case "sub-or-one-time":
      return (
        subscriptions.some((s) => activeSubGrantsAccess(s, now)) ||
        entitlements.some(
          (e) =>
            (e.source === "one-time" || e.source === "granted") &&
            e.course_id === courseId,
        )
      );
  }
}

/** Five-state effective-access model (ADR-220) — the honest matrix. */
export type EffectiveAccessState =
  | "granted"
  | "one-time"
  | "subscribed"
  | "free"
  | "none";

/** Effective-access chip label + single-letter grid variant. */
export const EFFECTIVE_ACCESS_META: Record<
  EffectiveAccessState,
  { label: string; letter: string }
> = {
  granted: { label: "Granted", letter: "G" },
  "one-time": { label: "One-time", letter: "O" },
  subscribed: { label: "Subscribed", letter: "S" },
  free: { label: "Free", letter: "F" },
  none: { label: "None", letter: "—" },
};

/**
 * Pure five-state resolver (ADR-220). Resolves every user × course pair to
 * EXACTLY ONE of granted/one-time/subscribed/free/none, computed from the same
 * seam inputs the learner gate uses (course model + entitlements + subs), so
 * the admin surface and the gate never disagree. Never "empty = no access".
 *
 * Resolution order (authoritative): non-live/no-row → none; free → free;
 * granted entitlement → granted; one-time entitlement → one-time; an active
 * subscription grants via courseGrantsAccess → subscribed; else → none.
 * Admin-granted beats a subscription for the same course (granted > one-time
 * > subscribed > free > none).
 */
export function effectiveAccessState(input: {
  course: CourseRow | null;
  /** Active (non-revoked) entitlements. */
  entitlements: UserEntitlementRow[];
  /** The user's subscriptions (any status). */
  subscriptions: SubscriptionRow[];
  now: string;
}): EffectiveAccessState {
  const { course, entitlements, subscriptions, now } = input;
  // Display lens resolves against the live model (arch §2.3 rule 1): a
  // pending/archived/missing course shows as `none` on the live-only grid.
  if (!course || course.status !== "live") return "none";
  if (course.access_model === "free") return "free";
  if (hasGrantedEntitlementFor(course.id, entitlements)) return "granted";
  if (
    entitlements.some(
      (e) => e.source === "one-time" && e.course_id === course.id,
    )
  ) {
    return "one-time";
  }
  if (
    courseGrantsAccess(
      course.access_model,
      entitlements,
      subscriptions,
      now,
      course.id,
    )
  ) {
    return "subscribed";
  }
  return "none";
}

/** Pure single-course decision — the heart of the seam. */
export function decideCourseAccessFromInput(
  input: {
    course: CourseRow | null;
    isAdmin: boolean;
    entitlements: UserEntitlementRow[];
    subscriptions: SubscriptionRow[];
    now: string;
  },
): CourseAccessDecision {
  const { course, isAdmin } = input;
  if (!course) return { kind: "not-launched" };
  if (isAdmin) return { kind: "admin-preview" };
  if (course.status !== "live") return { kind: "not-launched" };
  // Stealth-granted (v4): a `granted`-model course is invisible to anyone
  // without a matching granted entitlement. Return not-launched (NOT a
  // paywall) so the course's very existence stays hidden from non-admins.
  if (
    course.access_model === "granted" &&
    !hasGrantedEntitlementFor(course.id, input.entitlements)
  ) {
    return { kind: "not-launched" };
  }
  if (
    courseGrantsAccess(
      course.access_model,
      input.entitlements,
      input.subscriptions,
      input.now,
      course.id,
    )
  ) {
    return { kind: "granted" };
  }
  return { kind: "paywall" };
}

/** Pure catalog build: visibility + access per course row the caller can see. */
export function buildCatalogEntries(
  input: AccessInput,
): CatalogCourseEntry[] {
  return input.courses.map((course) => {
    const visible = input.isAdmin
      ? true // admin previews pending/archived + reads live
      : // Non-live courses. ARCHIVED stays hidden from non-admins. PENDING
        // renders publicly as a "coming soon" placeholder (B-10/D1) — EXCEPT
        // a pending-GRANTED course, which is stealth-hidden externally and
        // visible only to a matching grant holder. Pending + any other access
        // model shows the public placeholder.
        course.status === "archived"
        ? false
        : course.status === "pending"
          ? course.access_model === "granted"
            ? hasGrantedEntitlementFor(course.id, input.entitlements)
            : true
          : // Live. Stealth-granted (v4): a granted-model course is hidden
            // from the public catalog unless the user holds a matching grant.
            course.access_model === "granted"
            ? hasGrantedEntitlementFor(course.id, input.entitlements)
            : true
    const canAccess = input.isAdmin
      ? true // admin previews pending/archived + reads live
      : course.status === "live" &&
        courseGrantsAccess(
          course.access_model,
          input.entitlements,
          input.subscriptions,
          input.now,
          course.id,
        );
    return { course, visible, canAccess };
  });
}

/* ------------------------------------------------------------------ */
/*  Data loader — how the seam fetches rows.                          */
/* ------------------------------------------------------------------ */

/**
 * The data-access seam the seam reads through. Default is the Supabase
 * cookie-bound server client (RLS-scoped). Tests inject a fake loader so the
 * full seam path is verifiable without a live database.
 */
export interface PlatformDataLoader {
  getCourseBySlug(slug: string): Promise<CourseRow | null>;
  /** Courses the caller may see — RLS returns live-only for members, all for admins. */
  getCatalogCourses(): Promise<CourseRow[]>;
  getRole(userId: string): Promise<UserRole | null>;
  getActiveEntitlements(userId: string): Promise<UserEntitlementRow[]>;
  getActiveSubscriptions(userId: string): Promise<SubscriptionRow[]>;
  /* ---- Learn Platform v2 (migration 009) — organization as data ---- */
  /** Top-level Learn sections (Certifications / Tracks / Learning Paths). */
  getSections(): Promise<CatalogSection[]>;
  /** Vendor/family groups under a section. */
  getGroups(): Promise<CatalogGroup[]>;
  /** Structured "this course requires X" join rows. */
  getPrerequisites(): Promise<CoursePrerequisiteRow[]>;
}

/** ISO "now" — one timestamp per seam call so all reads agree. */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Default loader backed by the cookie-bound server client. Cached per-request
 * (React `cache`) so getCatalogForUser + decideCourseAccess on the same
 * request share one courses read (arch §3 — avoid N+1).
 */
const loadCatalogCourses = cache(async (): Promise<CourseRow[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("courses").select("*");
  if (error) throw error;
  return (data ?? []) as CourseRow[];
});

async function loadCourseBySlug(slug: string): Promise<CourseRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("series_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as CourseRow | null) ?? null;
}

// Per-request cached so a paywall page's second read shares one DB call.
const loadCourseBySlugCached = cache(loadCourseBySlug);

/** Public, per-request-cached course row lookup (pages use for paywall views). */
export async function getCourseRowBySlug(
  slug: string,
): Promise<CourseRow | null> {
  return loadCourseBySlugCached(slug);
}

async function loadRole(userId: string): Promise<UserRole | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { role: UserRole } | null)?.role ?? null;
}

async function loadActiveEntitlements(
  userId: string,
): Promise<UserEntitlementRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
  return (data ?? []) as UserEntitlementRow[];
}

async function loadActiveSubscriptions(
  userId: string,
): Promise<SubscriptionRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

// Learn v2 org loaders — SELECT public via RLS (sections/groups/prereqs are
// non-sensitive metadata), so the cookie-bound client can read them for any
// user (guests included). Per-request cached to share one read across the
// catalog build on the same request.
const loadSections = cache(async (): Promise<CatalogSection[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("catalog_sections")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogSection[];
});

const loadGroups = cache(async (): Promise<CatalogGroup[]> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("catalog_groups")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogGroup[];
});

const loadPrerequisites = cache(
  async (): Promise<CoursePrerequisiteRow[]> => {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("course_prerequisites")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CoursePrerequisiteRow[];
  },
);

/** Public, per-request-cached catalog org rows (used by the v2 builder). */
export async function getCatalogOrg(): Promise<{
  sections: CatalogSection[];
  groups: CatalogGroup[];
  prerequisites: CoursePrerequisiteRow[];
}> {
  const [sections, groups, prerequisites] = await Promise.all([
    loadSections(),
    loadGroups(),
    loadPrerequisites(),
  ]);
  return { sections, groups, prerequisites };
}

/** Production loader — RLS cookie-bound reads. */
export const supabaseLoader: PlatformDataLoader = {
  getCourseBySlug: loadCourseBySlug,
  getCatalogCourses: loadCatalogCourses,
  getRole: loadRole,
  getActiveEntitlements: loadActiveEntitlements,
  getActiveSubscriptions: loadActiveSubscriptions,
  getSections: loadSections,
  getGroups: loadGroups,
  getPrerequisites: loadPrerequisites,
};

/* ------------------------------------------------------------------ */
/*  Seam factory                                                      */
/* ------------------------------------------------------------------ */

/** Build the access seam over a data loader (defaults to Supabase). */
export function createAccessSeam(
  loader: PlatformDataLoader = supabaseLoader,
): AccessSeam {
  async function isAdmin(userId: UserId): Promise<boolean> {
    if (!userId) return false;
    const role = await loader.getRole(userId);
    return role === "admin";
  }

  return {
    async isAdmin(userId) {
      return isAdmin(userId);
    },

    async getCatalogForUser(
      userId: UserId,
    ): Promise<CatalogForUserResult> {
      const [courses, admin] = await Promise.all([
        loader.getCatalogCourses(),
        isAdmin(userId),
      ]);
      const entitlements = userId
        ? await loader.getActiveEntitlements(userId)
        : [];
      const subscriptions = userId
        ? await loader.getActiveSubscriptions(userId)
        : [];
      const entries = buildCatalogEntries({
        isAdmin: admin,
        courses,
        entitlements,
        subscriptions,
        now: nowIso(),
      });
      return { entries, isAdmin: admin };
    },

    async decideCourseAccess(
      userId: UserId,
      seriesSlug: string,
    ): Promise<CourseAccessDecision> {
      const [course, admin] = await Promise.all([
        loader.getCourseBySlug(seriesSlug),
        isAdmin(userId),
      ]);
      const entitlements = userId
        ? await loader.getActiveEntitlements(userId)
        : [];
      const subscriptions = userId
        ? await loader.getActiveSubscriptions(userId)
        : [];
      return decideCourseAccessFromInput({
        course,
        isAdmin: admin,
        entitlements,
        subscriptions,
        now: nowIso(),
      });
    },
  };
}

/** Singleton seam (Supabase-backed) — import this from pages/routes. */
export const accessSeam = createAccessSeam();

/**
 * Resolve the current signed-in user id from the HttpOnly session cookie.
 * Guests → null. Reuse this from server components/routes before calling the
 * seam so the userId matches the RLS-scoped cookie user.
 */
export async function getAccessUserId(): Promise<UserId> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
