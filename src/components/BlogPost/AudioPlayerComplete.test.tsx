/**
 * AudioPlayerComplete.test.tsx — the "Mark complete" control in the lesson
 * audio bar (K2, design t_239eb3ed). useLessonProgress is mocked at the module
 * level so the single write path (POST /api/progress/lesson, called inside the
 * hook's markComplete) is asserted through the hook — not a second path.
 *
 * jsdom has no layout, so the fixed 144×44 slot is asserted by its markup
 * classes (.ab-complete wrapper + .mc-btn / .mc-chip children) — the pixel
 * proof (0px bar/audio shift, 2-row grid, 72px compact strip) lives in the
 * design specimen sheet design/mockup-sticky-complete.html.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayer from "./AudioPlayer";

const SLUG = "agent-eval-infrastructure-2026";

let authState: { user: { id: string; email: string; isAdmin: boolean } | null; isLoading: boolean };
let progressState: { isCompleted: boolean; isLoading: boolean };
const markComplete = vi.fn();

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progressState, markComplete }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
  progressState = { isCompleted: false, isLoading: false };
  markComplete.mockReset();
  // Empty timings manifest -> no Follow-along toggle, keeping these tests
  // focused on the completion control.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ segments: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AudioPlayer completion control (K2)", () => {
  it("renders a 'Mark complete' button inside the fixed .ab-complete slot on a lesson", () => {
    render(<AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />);

    const btn = screen.getByRole("button", { name: /Mark complete/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("mc-btn");

    // The button lives inside the fixed slot; the slot is what pins 144×44 so
    // the swap can never resize the audio.
    const slot = btn.closest(".ab-complete");
    expect(slot).not.toBeNull();

    // The completion-bearing card carries the .has-complete modifier that
    // scopes the container query + two-row/compact layout.
    expect(btn.closest(".audio-card")?.className).toContain("has-complete");
  });

  it("marks complete via the single write path (useLessonProgress.markComplete)", async () => {
    render(<AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />);

    await userEvent.click(screen.getByRole("button", { name: /Mark complete/i }));

    expect(markComplete).toHaveBeenCalledTimes(1);
  });

  it("renders a static 'Completed' chip (role=status, tabindex=-1) and no button once complete", () => {
    progressState = { isCompleted: true, isLoading: false };
    render(<AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />);

    const chip = screen.getByRole("status");
    expect(chip).toHaveTextContent("Completed");
    expect(chip).toHaveAttribute("tabindex", "-1");
    expect(chip.className).toContain("mc-chip");
    expect(chip.closest(".ab-complete")).not.toBeNull();

    // No toggle / no second affordance in the bar — un-marking lives on the
    // hero MarkComplete control.
    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
  });

  it("renders NO completion slot on the article (field-notes) bar when lessonSlug is absent", () => {
    render(<AudioPlayer slug={SLUG} hasAudio />);

    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".ab-complete")).toBeNull();
    // The article card is NOT a completion container.
    expect(document.querySelector(".audio-card")?.className).not.toContain("has-complete");
  });

  it("disables the button (aria-disabled) while the hook is still hydrating", () => {
    progressState = { isCompleted: false, isLoading: true };
    render(<AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />);

    const btn = screen.getByRole("button", { name: /Mark complete/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps Follow-along + Speed in the header alongside the completion slot", async () => {
    // A non-empty timings manifest turns on the Follow-along toggle, so the
    // header holds label + follow + speed + completion in one row.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            segments: [{ text: "Section: Introduction.", startSec: 0, endSec: 3 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />);

    expect(screen.getByRole("button", { name: /Mark complete/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Playback speed")).toBeInTheDocument();
    // The "Speed" word is wrapped in .sfl so the two-row grid can collapse it.
    expect(screen.getByText("Speed").className).toContain("sfl");
    expect(await screen.findByRole("checkbox", { name: /Follow along/i })).toBeInTheDocument();
  });

  // ── FOCUS CONTRACT (design §a11y, QA t_81573261) ──────────────────
  // Focus moves to the chip ONLY when the reader's own press removes the
  // button. A completed lesson loading, or a same-tab/cross-tab sync flipping
  // the hook's hydration-safe `false` to `true`, must not steal focus.
  const renderLesson = () => (
    <AudioPlayer slug={SLUG} hasAudio label="lesson" lessonSlug={SLUG} />
  );

  it("does NOT steal focus when an already-completed lesson loads", () => {
    progressState = { isCompleted: true, isLoading: false };
    render(renderLesson());

    const chip = screen.getByRole("status");
    expect(chip).toBeInTheDocument();
    expect(chip).not.toHaveFocus();
  });

  it("does NOT steal focus when completion arrives from a sync (no user press)", () => {
    const { rerender } = render(renderLesson());
    expect(screen.getByRole("button", { name: /Mark complete/i })).toBeInTheDocument();

    // Simulates the hook's mount read / storage-event sync: isCompleted goes
    // false → true with no click having happened.
    progressState = { isCompleted: true, isLoading: false };
    rerender(renderLesson());

    expect(screen.getByRole("status")).not.toHaveFocus();
  });

  it("moves focus to the chip after the reader presses Mark complete", async () => {
    const { rerender } = render(renderLesson());
    await userEvent.click(screen.getByRole("button", { name: /Mark complete/i }));
    expect(markComplete).toHaveBeenCalledTimes(1);

    // The swap that follows the press (optimistic state flip in the real hook).
    progressState = { isCompleted: true, isLoading: false };
    rerender(renderLesson());

    expect(screen.getByRole("status")).toHaveFocus();
  });
});
