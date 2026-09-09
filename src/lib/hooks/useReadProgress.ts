/**
 * useReadProgress — client hook for tracking blog/lesson read state.
 *
 * Authenticated users: reads from Supabase, writes via API route.
 * Guests: reads/writes from localStorage only.
 *
 * Namespaced localStorage keys: adroit-blog:read:<slug>
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { notifyProgressChanged, PROGRESS_CHANGED_EVENT } from "@/lib/progress";

const STORAGE_KEY_PREFIX = "adroit-blog:read:";

interface UseReadProgressReturn {
  isRead: boolean;
  markAsRead: () => void;
  isLoading: boolean;
}

/** Check localStorage for a read record. */
function getReadFromStorage(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${slug}`) === "true";
  } catch {
    return false;
  }
}

/** Write a read record to localStorage. */
function setReadInStorage(slug: string, read: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${slug}`, String(read));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

/** Fetch read state from Supabase for a specific content slug. */
async function fetchReadState(
  client: ReturnType<typeof getSupabaseClient>,
  contentType: "blog" | "lesson",
  contentSlug: string,
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("read_progress")
      .select("read_at")
      .eq("content_type", contentType)
      .eq("content_slug", contentSlug)
      .maybeSingle();

    if (error) return false;
    return data !== null && "read_at" in data;
  } catch {
    return false;
  }
}

/** Mark content as read via API route. */
async function markAsReadAPI(contentType: "blog" | "lesson", contentSlug: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, contentSlug }),
    });
  } catch {
    // Fire-and-forget — localStorage fallback handles persistence
  }
}

/** Unmark content as read via API route (removes the Supabase row). */
async function unmarkAsReadAPI(contentType: "blog" | "lesson", contentSlug: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/progress/read", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, contentSlug }),
    });
  } catch {
    // Fire-and-forget — localStorage already flipped to false
  }
}

export function useReadProgress(
  slug: string,
  contentType: "blog" | "lesson" = "blog",
): UseReadProgressReturn {
  // Hydration-safe (QA M-2): localStorage is NEVER read in the useState
  // initializer — a stored read record would make the client's first paint
  // differ from the server HTML and throw a full hydration failure. Both
  // server and first client render start unread; the mounted effect below
  // reads the stored value after hydration.
  const [isRead, setIsRead] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Sync from other hook instances: when any MarkAsRead / PostCardWithRead
  // instance toggles, every instance of this hook for the same slug updates
  // (same-tab via PROGRESS_CHANGED_EVENT, cross-tab via the storage event).
  useEffect(() => {
    const onChanged = () => setIsRead(getReadFromStorage(slug));
    // Mount-gate hydration read (QA M-2): the documented React pattern for
    // client-only data — read AFTER mount so the server HTML and the
    // client's first paint both render the unread state. The setState here
    // runs inside the callback, so the rule above stays clean.
    onChanged();
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [slug]);

  useEffect(() => {
    // Check Supabase first (if auth exists), fall back to localStorage
    const checkSupabase = async () => {
      try {
        const { data: { user } } = await getSupabaseClient().auth.getUser();
        if (user) {
          const readState = await fetchReadState(getSupabaseClient(), contentType, slug);
          setIsRead(readState);
          if (readState) setReadInStorage(slug, true);
        }
      } catch {
        // No auth or error — use localStorage
      } finally {
        setIsLoading(false);
      }
    };

    checkSupabase();
  }, [slug, contentType]);

  const markAsRead = useCallback(() => {
    const newReadState = !isRead;
    setIsRead(newReadState);
    setReadInStorage(slug, newReadState);
    notifyProgressChanged();

    if (newReadState) {
      markAsReadAPI(contentType, slug);
    } else {
      unmarkAsReadAPI(contentType, slug);
    }
  }, [isRead, slug, contentType]);

  return { isRead, markAsRead, isLoading };
}
