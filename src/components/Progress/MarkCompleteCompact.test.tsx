/**
 * MarkCompleteCompact.test.tsx — the bar control against the REAL
 * useLessonProgress hook (card A8 t_1975dec0).
 *
 * These tests deliberately do not mock the hook: the evidence the card asks
 * for is the write path itself —
 *
 *  - one tap on the bar's "Mark complete" produces exactly ONE
 *    `POST /api/progress/lesson`, with the lesson slug in the body;
 *  - the hero control and the bar never disagree, in either direction
 *    (bar → hero, hero → bar), because both read the same hook and the same
 *    `PROGRESS_CHANGED_EVENT` broadcast;
 *  - the completed state is a static `role="status"` chip, never a toggle.
 *
 * Supabase is stubbed at the module boundary (auth user present, no completion
 * row) so the hook takes its authenticated path without a network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarkCompleteCompact from "./MarkCompleteCompact";
import MarkComplete from "./MarkComplete";

const SLUG = "agent-eval-infrastructure-2026";

let completionRow: { completed_at: string } | null = null;

vi.mock("@/lib/db/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: completionRow, error: null }),
        }),
      }),
    }),
  }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

/** Render and wait for the hook's mount reads, so controls are interactive. */
async function renderSettled() {
  const view = render(renderLessonControls());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` })).toBeEnabled(),
  );
  return view;
}

/** The lesson page's real composition: hero toggle + sticky-bar control. */
const renderLessonControls = () => (
  <>
    <MarkComplete lessonSlug={SLUG} label={`lesson ${SLUG}`} />
    <MarkCompleteCompact lessonSlug={SLUG} label={`lesson ${SLUG}`} />
  </>
);

beforeEach(() => {
  completionRow = null;
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every write the hook made, filtered to the lesson-progress endpoint. */
function progressWrites() {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/progress/lesson"));
}

describe("MarkCompleteCompact — single write path", () => {
  it("records completion with exactly one POST per tap, keyed to the lesson", async () => {
    await renderSettled();

    await userEvent.click(screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` }));
    await waitFor(() => expect(progressWrites()).toHaveLength(1));

    const [url, init] = progressWrites()[0];
    expect(String(url)).toBe("/api/progress/lesson");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ lessonSlug: SLUG });

    // The chip replaces the button: there is no second tap target left in the
    // bar, so the same control cannot post a duplicate.
    expect(screen.queryByRole("button", { name: `Mark complete for lesson ${SLUG}` })).toBeNull();
  });

  it("is a static role=status chip once complete, not a toggle", async () => {
    await renderSettled();
    await userEvent.click(screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` }));

    const chip = await screen.findByRole("status");
    expect(chip).toHaveAttribute("tabindex", "-1");
    expect(chip.closest(".ab-complete")).not.toBeNull();
    expect(chip).not.toHaveAttribute("aria-pressed");
    // No interaction affordance on the chip.
    expect(screen.queryByRole("button", { name: /Completed/i })).toBeNull();
  });

  it("never writes an un-mark from the bar (the hero owns un-marking)", async () => {
    await renderSettled();
    await userEvent.click(screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` }));
    await waitFor(() => expect(progressWrites()).toHaveLength(1));

    // Clicking the chip does nothing: it is a span, not a control.
    await userEvent.click(screen.getByRole("status"));
    expect(progressWrites()).toHaveLength(1);
  });
});

describe("MarkCompleteCompact — hero ↔ bar sync", () => {
  it("bar → hero: marking from the bar flips the hero toggle to completed", async () => {
    await renderSettled();

    const hero = screen.getByRole("button", { name: `Mark lesson ${SLUG} complete` });
    expect(hero).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: `Mark complete for lesson ${SLUG}` }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Unmark lesson ${SLUG} incomplete` }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hero → bar: un-marking from the hero brings the bar's button back", async () => {
    await renderSettled();

    // Complete from the hero, bar must follow.
    await userEvent.click(screen.getByRole("button", { name: `Mark lesson ${SLUG} complete` }));
    expect(await screen.findByRole("status")).toBeInTheDocument();

    // Un-mark from the hero, bar must follow back — and the DELETE is the only
    // other write.
    await userEvent.click(
      screen.getByRole("button", { name: `Unmark lesson ${SLUG} incomplete` }),
    );

    expect(
      await screen.findByRole("button", { name: `Mark complete for lesson ${SLUG}` }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();

    const deletes = progressWrites().filter(([, init]) => init?.method === "DELETE");
    expect(deletes).toHaveLength(1);
  });

  it("shows the completed chip on first paint for an already-completed lesson", async () => {
    completionRow = { completed_at: "2026-10-20T12:00:00.000Z" };
    // Not renderSettled(): this lesson is already complete, so the bar has no
    // "Mark complete" button to wait for — the chip is the settled state.
    render(renderLessonControls());

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Unmark lesson ${SLUG} incomplete` }),
    ).toHaveAttribute("aria-pressed", "true");
    // Reading an already-complete lesson is not a write.
    expect(progressWrites()).toHaveLength(0);
  });
});

describe("MarkCompleteCompact — viewport contract (360 / 390 / 844×390)", () => {
  // jsdom has no layout engine, so these assert the markup + CSS contract that
  // produces the measured K2 layout (fixed 144×44 slot, two-row grid at 360 /
  // 390, compact strip at 844×390). Pixel re-measurement happens in A9 against
  // the real browser; the numbers are in design/sticky-complete-control.md §10.
  const viewports: [string, number, number][] = [
    ["360×800", 360, 800],
    ["390×844", 390, 844],
    ["844×390", 844, 390],
  ];

  it.each(viewports)("%s keeps the control in the fixed slot at a 44px target", async (_label, w, h) => {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));

    render(<MarkCompleteCompact lessonSlug={SLUG} label={`lesson ${SLUG}`} />);

    const btn = await screen.findByRole("button", { name: `Mark complete for lesson ${SLUG}` });
    // .ab-complete is the 144×44 slot and .mc-btn the 44px-min button (CSS).
    expect(btn.closest(".ab-complete")).not.toBeNull();
    expect(btn.className).toContain("mc-btn");
  });
});
