/**
 * Shared progress derivation helpers (client-safe).
 *
 * localStorage keys are namespaced per ADR-002:
 *   adroit-blog:read:blog/<slug>    — blog post read state (prefixed slug)
 *   adroit-blog:read:lesson/<slug>  — lesson read state (prefixed slug)
 *   adroit-blog:lesson:<slug>       — lesson completion state (bare slug)
 *   adroit-blog:quiz:<name>         — quiz attempts (JSON)
 */
export const READ_KEY_PREFIX = "adroit-blog:read:";
export const LESSON_KEY_PREFIX = "adroit-blog:lesson:";
export const QUIZ_KEY_PREFIX = "adroit-blog:quiz:";

export function readKey(slug: string): string {
  return `${READ_KEY_PREFIX}${slug}`;
}

export function lessonKey(slug: string): string {
  return `${LESSON_KEY_PREFIX}${slug}`;
}

export function quizKey(name: string): string {
  return `${QUIZ_KEY_PREFIX}${name}`;
}

/** Read a boolean flag from localStorage (safe on server / storage errors). */
export function getFlagFromStorage(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/** Custom event fired after any progress write (read/complete/quiz). */
export const PROGRESS_CHANGED_EVENT = "adroit-blog:progress-changed";

/** Broadcast that progress changed so aggregate bars re-read localStorage. */
export function notifyProgressChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}

/**
 * Count how many of the given keys are marked done in localStorage.
 * `keys` must already be in canonical storage form (see module doc).
 */
export function countDoneInStorage(keys: string[]): number {
  return keys.filter((key) => getFlagFromStorage(readKey(key)) || getFlagFromStorage(lessonKey(key))).length;
}

/**
 * Merge localStorage flags with a Supabase summary (authenticated users).
 *
 * @param readKeys  Full canonical read keys, e.g. ["blog/foo", "lesson/bar"]
 *                  (matches both the localStorage read prefix and the DB
 *                  content_slug values returned by /api/progress/summary).
 * @param lessonKeys Bare lesson slugs for completion (DB lesson_slug form),
 *                  e.g. ["day-01-f1"].
 */
export interface ProgressMerge {
  read: Set<string>;
  lessons: Set<string>;
}

export function mergeProgressFromSummary(
  summary: {
    readContent?: { blog?: string[]; lesson?: string[] };
    completedLessons?: string[];
  } | null,
  readKeys: string[],
  lessonKeys: string[],
): ProgressMerge {
  const read = new Set<string>();
  const lessons = new Set<string>();

  // localStorage first (guests + fallback)
  readKeys.forEach((key) => {
    if (getFlagFromStorage(readKey(key))) read.add(key);
  });
  lessonKeys.forEach((slug) => {
    if (getFlagFromStorage(lessonKey(slug))) lessons.add(slug);
  });

  // Supabase merge (authenticated) — DB stores the same canonical forms
  if (summary) {
    (summary.readContent?.blog ?? []).forEach((slug) => read.add(slug));
    (summary.readContent?.lesson ?? []).forEach((slug) => read.add(slug));
    (summary.completedLessons ?? []).forEach((slug) => lessons.add(slug));
  }

  return { read, lessons };
}
