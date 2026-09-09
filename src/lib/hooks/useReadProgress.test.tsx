/**
 * useReadProgress — hydration-safe read state tests (QA motion M-2).
 *
 * Coverage required by the QA report:
 *  - localStorage is NEVER read in the useState initializer: SSR output is
 *    the unread state even when a read record exists in storage (no full
 *    hydration failure on post pages)
 *  - after mount, the stored record flips isRead to true
 *  - markAsRead toggles the stored flag and broadcasts progress-changed
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useReadProgress } from "./useReadProgress";

// Deterministic guest path: no authed user → hook falls back to localStorage.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

const KEY = "adroit-blog:read:blog/test-post";

/** Probe that surfaces hook state — used for SSR renderToString checks. */
function Probe({ slug = "blog/test-post" }: { slug?: string }) {
  const { isRead } = useReadProgress(slug, "blog");
  return <div>{isRead ? "read" : "unread"}</div>;
}

describe("useReadProgress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is hydration-safe: SSR renders unread even when a read record exists in storage", () => {
    localStorage.setItem(KEY, "true");

    const html = renderToString(<Probe />);
    // Server renderer never runs effects — the useState initializer must NOT
    // touch localStorage, otherwise server HTML would diverge from the
    // client's first paint (QA M-2 root cause).
    expect(html).toBe("<div>unread</div>");
  });

  it("hydrates from storage after mount: isRead flips to true", async () => {
    localStorage.setItem(KEY, "true");

    const { result } = renderHook(() => useReadProgress("blog/test-post", "blog"));

    // First client paint matches SSR (unread), then the mounted effect reads
    // the stored record and the Supabase guest check finishes.
    await waitFor(() => expect(result.current.isRead).toBe(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("stays unread for a fresh post with no record", async () => {
    const { result } = renderHook(() => useReadProgress("blog/fresh", "blog"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isRead).toBe(false);
  });

  it("markAsRead toggles the stored flag and persists it", async () => {
    const { result } = renderHook(() => useReadProgress("blog/test-post", "blog"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.markAsRead());
    expect(result.current.isRead).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");

    act(() => result.current.markAsRead());
    expect(result.current.isRead).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
  });
});
