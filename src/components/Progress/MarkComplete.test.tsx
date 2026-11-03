/**
 * MarkComplete.test.tsx — unit tests for MarkComplete button and useLessonProgress
 * batch synchronization contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarkComplete from "./MarkComplete";
import { PROGRESS_CHANGED_EVENT } from "@/lib/progress";

const SLUG = "test-lesson-sync";

let selectMock = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

vi.mock("@/lib/db/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: selectMock,
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  selectMock = vi.fn().mockResolvedValue({ data: null, error: null });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});

describe("MarkComplete with batch completion synchronization", () => {
  it("renders in completed state when isCompleted=true without querying Supabase directly", async () => {
    render(<MarkComplete lessonSlug={SLUG} label={`lesson ${SLUG}`} isCompleted={true} />);

    const button = await screen.findByRole("button", { name: `Unmark lesson ${SLUG} incomplete` });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("bg-green-500");

    // Must NOT fire redundant single-slug Supabase queries when batch state is provided
    expect(selectMock).not.toHaveBeenCalled();
    // Synchronizes to localStorage
    expect(window.localStorage.getItem(`adroit-blog:lesson:${SLUG}`)).toBe("true");
  });

  it("renders in incomplete state when isCompleted=false without querying Supabase directly", async () => {
    render(<MarkComplete lessonSlug={SLUG} label={`lesson ${SLUG}`} isCompleted={false} />);

    const button = await screen.findByRole("button", { name: `Mark lesson ${SLUG} complete` });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveClass("bg-green-500");

    expect(selectMock).not.toHaveBeenCalled();
  });

  it("unmarks complete when clicked, sending DELETE and notifying progress changed", async () => {
    const user = userEvent.setup();
    const eventSpy = vi.fn();
    window.addEventListener(PROGRESS_CHANGED_EVENT, eventSpy);

    render(<MarkComplete lessonSlug={SLUG} label={`lesson ${SLUG}`} isCompleted={true} />);

    const button = await screen.findByRole("button", { name: `Unmark lesson ${SLUG} incomplete` });
    await user.click(button);

    // Flips to unpressed
    expect(button).toHaveAttribute("aria-pressed", "false");
    // Explicitly sets localStorage to false to prevent resurrecting from stale cache
    expect(window.localStorage.getItem(`adroit-blog:lesson:${SLUG}`)).toBe("false");
    // Broadcasts progress event
    expect(eventSpy).toHaveBeenCalled();
    // Issues DELETE request to API route
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/progress/lesson",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ lessonSlug: SLUG }),
      }),
    );
  });

  it("falls back to Supabase query when isCompleted is undefined", async () => {
    selectMock.mockResolvedValueOnce({ data: { completed_at: "2026-11-03T12:00:00Z" }, error: null });

    render(<MarkComplete lessonSlug={SLUG} label={`lesson ${SLUG}`} />);

    await waitFor(() => {
      expect(selectMock).toHaveBeenCalled();
    });

    const button = await screen.findByRole("button", { name: `Unmark lesson ${SLUG} incomplete` });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});
