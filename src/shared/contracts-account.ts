/** Round 3 of Adroit Blog — src/shared/contracts-account.ts
 * Owned by brainiac (arch task t_cde0e74a). Sub-task workers (steel A–E)
 * IMPORT from here. DO NOT EDIT — if a contract is wrong, reopen the arch task.
 *
 * Mirrors: docs/system-architecture-account-round3.md (t_cde0e74a)
 */

/* ------------------------------------------------------------------ */
/*  Account profile (user_profiles)                                    */
/* ------------------------------------------------------------------ */

/** Dark-mode preference persisted per-account. `system` follows OS. */
export type ThemePref = "system" | "light" | "dark";

/** user_profiles row (mirrors table: user_id PK/FK, display_name, username, theme_pref). */
export interface UserProfile {
  userId: string;
  displayName: string | null;
  username: string | null;
  themePref: ThemePref;
}

/** GET /api/profile → 200 */
export interface ProfileGetResponse {
  user: { id: string; email: string };
  profile: UserProfile;
}

/** PATCH /api/profile request body — all fields optional; at least one present. */
export interface ProfilePatchRequest {
  displayName?: string | null;
  username?: string | null;
  themePref?: ThemePref;
}

/** PATCH /api/profile → 200 */
export interface ProfilePatchResponse {
  profile: UserProfile;
}

/* ------------------------------------------------------------------ */
/*  Continue learning (top of Learn hub, logged-in only)               */
/* ------------------------------------------------------------------ */

export interface ContinueLearningItem {
  /** Series slug (route /learn/<series>). */
  seriesSlug: string;
  seriesName: string;
  gradient: string;
  /** Lesson that is in progress: next uncompleted lesson's slug. */
  nextLessonSlug: string | null;
  nextLessonTitle: string | null;
  /** Total planned lessons for the series. */
  totalLessons: number;
  /** Distinct lesson_completion count for this series. */
  completedCount: number;
  /** completedCount / totalLessons (0–100, rounded). */
  percent: number;
  /** Most-recent completion timestamp across the series (for desc sort). */
  lastCompletedAt: string | null;
}

/** GET /api/continue-learning → 200 (logged-in); [] when no in-progress series. */
export interface ContinueLearningResponse {
  items: ContinueLearningItem[];
}

/* ------------------------------------------------------------------ */
/*  Learn taxonomy (content metadata, no DB)                           */
/* ------------------------------------------------------------------ */

/** Top-level group name (e.g. "Salesforce Certifications"); undefined → "Learning Paths". */
export type LearnGroup = string;

/** Optional subgroup under a group (e.g. "Developer", "Architect"); content metadata only. */
export type LearnSubgroup = string;

export interface LearnFilterState {
  /** Active top-level group chip; null = "All". */
  group: LearnGroup | null;
  /** Active subgroup chip within the active group; null = all of group. */
  subgroup: LearnSubgroup | null;
}

/* ------------------------------------------------------------------ */
/*  Auth gating (guest vs signed-in)                                   */
/* ------------------------------------------------------------------ */

/** Renders non-clickable for guests with a sign-in CTA. */
export type CardGateState = "guest-locked" | "signed-in";
