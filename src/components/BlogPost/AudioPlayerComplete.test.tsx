/**
 * AudioPlayerComplete.test.tsx — the completion control in the lesson audio
 * bar (K2 layout, card A8 t_1975dec0).
 *
 * The player no longer knows about completion: the lesson page passes
 * `<MarkCompleteCompact />` through the `trailing` slot. These tests render
 * that composition, with useLessonProgress mocked at the module level, so the
 * slot / chip / focus contract is asserted on the real markup. `jsdom` has no
 * layout, so the fixed 144×44 slot is asserted by its classes (.ab-complete
 * wrapper + .mc-btn / .mc-chip children) — the pixel proof (0px bar/audio
 * shift, two-row grid, 72px compact strip) lives in the K2 specimen sheet
 * `design/mockup-sticky-complete.html` and is re-measured in A9.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayer from "./AudioPlayer";
import MarkCompleteCompact from "@/components/Progress/MarkCompleteCompact";

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

/** The lesson page's composition: player + trailing completion control. */
const renderLesson = () => (
  <AudioPlayer
    slug={SLUG}
    hasAudio
    label="lesson"
    trailing={<MarkCompleteCompact lessonSlug={SLUG} label={`lesson ${SLUG}`} />}
  />
);

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

describe("AudioPlayer trailing completion slot (A8, K2 layout)", () => {
  it("renders a 'Mark complete' button inside the fixed .ab-complete slot", () => {
    render(renderLesson());

    const btn = screen.getByRole("button", { name: /Mark complete/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");
    expect(btn.className).toContain("mc-btn");

    // The button lives inside the fixed slot; the slot is what pins 144×44 so
    // the swap can never resize the audio.
    expect(btn.closest(".ab-complete")).not.toBeNull();

    // The trailing-bearing card carries the modifier that scopes the container
    // query + two-row/compact layout.
    expect(btn.closest(".audio-card")?.className).toContain("has-trailing");
  });

  it("names the lesson in the control's accessible name", () => {
    render(renderLesson());

    expect(
      screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` }),
    ).toBeInTheDocument();
  });

  it("marks complete via the single write path (useLessonProgress.markComplete)", async () => {
    render(renderLesson());

    await userEvent.click(screen.getByRole("button", { name: /Mark complete/i }));

    expect(markComplete).toHaveBeenCalledTimes(1);
  });

  it("renders a static 'Completed' chip (role=status, tabindex=-1) and no button once complete", () => {
    progressState = { isCompleted: true, isLoading: false };
    render(renderLesson());

    const chip = screen.getByRole("status");
    expect(chip).toHaveTextContent("Completed");
    expect(chip).toHaveAttribute("tabindex", "-1");
    expect(chip.className).toContain("mc-chip");
    expect(chip.closest(".ab-complete")).not.toBeNull();

    // No toggle / no second affordance in the bar — un-marking lives on the
    // hero MarkComplete control.
    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
  });

  it("renders NO slot on the article (field-notes) bar when no trailing prop is passed", () => {
    render(<AudioPlayer slug={SLUG} hasAudio />);

    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".ab-complete")).toBeNull();
    expect(document.querySelector(".audio-card")?.className).not.toContain("has-trailing");
  });

  it("guests get the locked card and never the trailing control", () => {
    authState = { user: null, isLoading: false };
    render(renderLesson());

    expect(screen.getByText(/Audio is a free perk for signed-in readers/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".ab-complete")).toBeNull();
  });

  it("lessons with no narration render no bar at all (unchanged)", () => {
    render(
      <AudioPlayer
        slug={SLUG}
        hasAudio={false}
        label="lesson"
        trailing={<MarkCompleteCompact lessonSlug={SLUG} />}
      />,
    );

    expect(document.querySelector(".audio-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark complete/i })).toBeNull();
  });

  it("disables the button (aria-disabled) while the hook is still hydrating", () => {
    progressState = { isCompleted: false, isLoading: true };
    render(renderLesson());

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
    render(renderLesson());

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
