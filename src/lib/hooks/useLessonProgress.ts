/**
 * useLessonProgress — client hook for tracking lesson completion state.
 *
 * Authenticated users: reads from Supabase, writes via API route.
 * Guests: reads/writes from localStorage only.
 *
 * Namespaced localStorage keys: adroit-blog:lesson:<slug>
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { notifyProgressChanged, PROGRESS_CHANGED_EVENT } from "@/lib/progress";
import { trackLessonComplete } from "@/lib/analytics";

const STORAGE_KEY_PREFIX = "adroit-blog:lesson:";

interface UseLessonProgressReturn {
  isCompleted: boolean;
  markComplete: () => void;
  isLoading: boolean;
}

function getCompletedFromStorage(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${slug}`) === "true";
  } catch {
    return false;
  }
}

function setCompletedInStorage(slug: string, completed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${slug}`, String(completed));
  } catch {
    // silent fail
  }
}

async function fetchCompletionState(
  client: ReturnType<typeof getSupabaseClient>,
  lessonSlug: string,
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("lesson_completion")
      .select("completed_at")
      .eq("lesson_slug", lessonSlug)
      .maybeSingle();

    if (error) return false;
    return data !== null && "completed_at" in data;
  } catch {
    return false;
  }
}

async function markCompleteAPI(lessonSlug: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonSlug }),
    });
  } catch {
    // fire-and-forget
  }
}

/** Unmark a lesson complete via API route (removes the Supabase row). */
async function unmarkCompleteAPI(lessonSlug: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/lesson", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonSlug }),
    });
  } catch {
    // fire-and-forget — localStorage already flipped to false
  }
}

export function useLessonProgress(lessonSlug: string): UseLessonProgressReturn {
  // Hydration-safe (same class as QA M-2 on useReadProgress): localStorage
  // is NEVER read in the useState initializer — a stored completion record
  // would make the client's first paint differ from the server HTML and
  // throw a full hydration failure on lesson pages. Both server and first
  // client render start incomplete; the mounted effect below reads the
  // stored value after hydration.
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Sync from other hook instances (same-tab + cross-tab).
  useEffect(() => {
    const onChanged = () => setIsCompleted(getCompletedFromStorage(lessonSlug));
    // Mount-gate hydration read (QA M-2 pattern): read AFTER mount so the
    // server HTML and the client's first paint both render the incomplete
    // state. The setState runs inside the callback, so the rule stays clean.
    onChanged();
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [lessonSlug]);

  useEffect(() => {
    const checkSupabase = async () => {
      try {
        const { data: { user } } = await getSupabaseClient().auth.getUser();
        if (user) {
          const completedState = await fetchCompletionState(getSupabaseClient(), lessonSlug);
          setIsCompleted(completedState);
          if (completedState) setCompletedInStorage(lessonSlug, true);
        }
      } catch {
        // no auth or error
      } finally {
        setIsLoading(false);
      }
    };

    checkSupabase();
  }, [lessonSlug]);

  const markComplete = useCallback(() => {
    const newState = !isCompleted;
    setIsCompleted(newState);
    setCompletedInStorage(lessonSlug, newState);
    notifyProgressChanged();

    if (newState) {
      markCompleteAPI(lessonSlug);
      // Progress-funnel analytics (backlog B-06): lesson → quiz → exam → cert.
      trackLessonComplete(lessonSlug);
    } else {
      unmarkCompleteAPI(lessonSlug);
    }
  }, [isCompleted, lessonSlug]);

  return { isCompleted, markComplete, isLoading };
}
