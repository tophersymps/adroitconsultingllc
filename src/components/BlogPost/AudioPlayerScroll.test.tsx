/**
 * AudioPlayerScroll.test.tsx — Tier C Follow-along toggle + exact paragraph
 * scroll-sync (plan Tier C). Authed player fetches the timing manifest from
 * /api/audio/<slug>/timings, aligns it to the article's content blocks, and
 * snaps the window scroll to the active spoken paragraph — throttled — while
 * "Follow along" is ON. A user scroll stops following (without pausing audio);
 * reduced-motion flips the default OFF.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayer from "./AudioPlayer";

const SLUG = "agent-eval-infrastructure-2026";

let authState: { user: { id: string; email: string; isAdmin: boolean } | null; isLoading: boolean };
let matchMediaCalls: string[];

const SEGMENTS = [
  { text: "Section: Introduction.", startSec: 0, endSec: 3 },
  { text: "The architecture evolved significantly.", startSec: 3, endSec: 6 },
  { text: "This is the second paragraph.", startSec: 6, endSec: 9 },
];

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function stubArticle() {
  // A minimal article-body so block extraction finds content elements.
  const body = document.createElement("main");
  body.id = "main";
  body.innerHTML = `
    <article class="article-body">
      <h2>Introduction</h2>
      <p>The architecture evolved significantly.</p>
      <p>This is the second paragraph.</p>
      <div class="keep-learning">trailer</div>
    </article>`;
  document.body.appendChild(body);
}

beforeEach(() => {
  authState = { user: null, isLoading: true };
  matchMediaCalls = [];
  window.matchMedia = ((q: string) => {
    matchMediaCalls.push(q);
    return {
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: vi.fn(),
  });
  // jsdom has no getBoundingClientRect on elements until they have geometry.
  // Give every element a deterministic top (its index * 100px).
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function () {
      const idx = Array.from(document.body.querySelectorAll("*")).indexOf(this);
      return { top: idx * 100, bottom: idx * 100 + 50, height: 50, width: 100, left: 0, right: 100, x: 0, y: idx * 100 };
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ segments: SEGMENTS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function renderAuthed() {
  authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
  stubArticle();
  render(<AudioPlayer slug={SLUG} hasAudio />);
}

function getAudio(): HTMLAudioElement {
  return document.querySelector("audio")!;
}

function timeupdate(seconds: number) {
  const audio = getAudio();
  Object.defineProperty(audio, "currentTime", { value: seconds, writable: true });
  audio.dispatchEvent(new Event("timeupdate"));
}

describe("AudioPlayer Follow-along", () => {
  it("is ON by default for a signed-in reader with no reduced-motion", async () => {
    renderAuthed();
    await waitFor(() => {
      const toggle = screen.getByRole("checkbox", { name: /Follow along/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();
    });
  });

  it("defaults OFF under prefers-reduced-motion", async () => {
    // make the media query report reduce
    window.matchMedia = ((q: string) => {
      matchMediaCalls.push(q);
      return {
        matches: q === "(prefers-reduced-motion: reduce)",
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }) as typeof window.matchMedia;
    renderAuthed();
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();
    });
    expect(matchMediaCalls.some((q) => q.includes("prefers-reduced-motion"))).toBe(true);
  });

  it("snap-scrolls to the active spoken paragraph while following (timeupdate -> scrollTo)", async () => {
    renderAuthed();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeInTheDocument());
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // t=4s -> segment 1 -> "The architecture evolved significantly."
    timeupdate(4);
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalled();
    });
    const call = scrollTo.mock.calls[scrollTo.mock.calls.length - 1][0];
    // target = blockDocTop - (playerHeight+headerHeight+gap); jsdom top is
    // deterministic, so assert an exact numeric scrollTo({top}) payload.
    expect(typeof call).toBe("object");
    expect(call).toHaveProperty("top");
    expect(call.top).toBeGreaterThan(0);
  });

  it("stops scrolling when the toggle is turned OFF (audio keeps playing)", async () => {
    renderAuthed();
    await waitFor(() => {
      const toggle = screen.getByRole("checkbox", { name: /Follow along/i });
      expect(toggle).toBeChecked();
    });
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    await userEvent.click(screen.getByRole("checkbox", { name: /Follow along/i }));
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();

    timeupdate(4);
    timeupdate(7);
    // rAF/throttle means a couple of ticks shouldn't reach scrollTo after off
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("a user scroll stops following WITHOUT pausing audio", async () => {
    renderAuthed();
    await waitFor(() => {
      const toggle = screen.getByRole("checkbox", { name: /Follow along/i });
      expect(toggle).toBeChecked();
    });
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // user scrolls the player container (capture onWheel bubbles to it)
    fireEvent.scroll(window, { target: document.body });
    // and also fire on the sticky wrapper element if present
    const wrapper = document.querySelector("[data-audio-scroll]");
    if (wrapper) fireEvent.scroll(wrapper);

    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();

    // audio element still exists & still has a src (not paused/removed)
    const audio = getAudio();
    expect(audio).not.toBeNull();
    expect(audio.getAttribute("src")).toBe(`/api/audio/${SLUG}`);

    timeupdate(4);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps the block alignment cached across same-paragraph timeupdates (no DOM re-query/re-align)", async () => {
    renderAuthed();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeChecked());
    const article = document.querySelector("main article")!;
    const qsa = vi.spyOn(article, "querySelectorAll");
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // All three ticks land inside segment 1 (3-6s) -> the SAME target block --
    // the exact ~4x/s case the caching targets. Only the first tick should
    // re-query the DOM + re-run the alignment; the rest reuse the cache.
    timeupdate(4);
    timeupdate(5);
    timeupdate(5.5);

    expect(qsa).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledTimes(1); // one snap for the block change
  });

  it("emits no Follow-along toggle for the logged-out locked card", async () => {
    authState = { user: null, isLoading: false };
    render(<AudioPlayer slug={SLUG} hasAudio />);
    expect(screen.getByText(/Listen to this article/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Follow along/i })).toBeNull();
  });
});

/**
 * Regression suite for the Follow-along self-cancel bug (t_078c9385).
 *
 * A real browser fires `scroll` events ASYNCHRONOUSLY and repeatedly while a
 * `behavior: "smooth"` scroll animates (~300-700ms). The old code cleared its
 * `programmaticScrollRef` guard 1ms after `scrollTo`, so every scroll event
 * from ITS OWN animation was misread as a user scroll -> following=false and the
 * toggle un-checked itself on every paragraph.
 *
 * These tests use a `window.scrollTo` mock that EMITS that burst (not a bare
 * mock, which is why the original suite was green on broken code). Each
 * test that triggers the burst waits >=150ms before finishing so the emulated
 * events have all landed locally (no pending timers leak into the next test).
 */
describe("AudioPlayer regression: follow-along survives its own programmatic scroll", () => {
  function stubScrollToWithSmoothBurst() {
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: vi.fn(() => {
        // Emulate a real smooth scroll: dispatch scroll events on the next frame
        // and keep dispatching them while the animation runs.
        for (let i = 1; i <= 6; i++) {
          setTimeout(() => window.dispatchEvent(new Event("scroll")), i * 16);
        }
      }),
    });
  }

  const settle = () => new Promise((r) => setTimeout(r, 150));

  it("AC-2/REPRO: keeps the toggle checked after a smooth-scroll event burst", async () => {
    stubScrollToWithSmoothBurst();
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());

    timeupdate(4); // advances into paragraph 1 — triggers our programmatic scroll
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());

    // Let the emulated smooth-scroll event burst land.
    await settle();

    expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeChecked();
  });

  it("AC-1: advancing across >=2 paragraphs keeps the toggle checked", async () => {
    stubScrollToWithSmoothBurst();
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // Paragraph 1 (t=4s) then paragraph 2 (t=7s).
    timeupdate(4);
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    await settle();

    timeupdate(7);
    await waitFor(() => expect(scrollTo.mock.calls.length).toBe(2));
    await settle();

    expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeChecked();
  });

  it("AC-1: scrolls once per new block, never re-scrolls within the same block", async () => {
    stubScrollToWithSmoothBurst();
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // All of these land in paragraph 1 (3s-6s). Only the first may scroll.
    timeupdate(4);
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    timeupdate(4.4);
    timeupdate(4.8);
    timeupdate(5);
    await settle();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeChecked();
  });

  it("AC-3: a wheel input still unchecks the toggle without pausing/muting audio", async () => {
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    fireEvent.wheel(window);
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();

    // audio element still exists & still has a src (not paused/removed)
    const audio = getAudio();
    expect(audio).not.toBeNull();
    expect(audio.getAttribute("src")).toBe(`/api/audio/${SLUG}`);

    timeupdate(4);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("AC-3: a touchmove input still unchecks the toggle without pausing audio", async () => {
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());

    fireEvent.touchMove(window);
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();
    expect(getAudio()).not.toBeNull();
  });

  it("AC-3: an arrow-key scroll input still unchecks the toggle without pausing audio", async () => {
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();
    expect(getAudio()).not.toBeNull();
  });

  it("AC-4: a scrollbar drag after the programmatic scroll has settled stops following", async () => {
    stubScrollToWithSmoothBurst();
    authState = { user: { id: "u1", email: "a@b.c", isAdmin: false }, isLoading: false };
    stubArticle();
    render(<AudioPlayer slug={SLUG} hasAudio />);

    const toggle = await screen.findByRole("checkbox", { name: /Follow along/i });
    await waitFor(() => expect(toggle).toBeChecked());
    const scrollTo = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    // Trigger a programmatic scroll and let the whole suppression window pass
    // (burst events at 16-96ms extend the no-scroll window to ~246ms; cap 800ms).
    timeupdate(4);
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 350)); // > settle window
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).toBeChecked();

    // A plain scroll with no preceding wheel/touch/key input = scrollbar drag.
    fireEvent.scroll(window, { target: document.body });
    expect(screen.getByRole("checkbox", { name: /Follow along/i })).not.toBeChecked();

    // Audio still present (not paused/removed).
    const audio = getAudio();
    expect(audio).not.toBeNull();
    expect(audio.getAttribute("src")).toBe(`/api/audio/${SLUG}`);
  });
});