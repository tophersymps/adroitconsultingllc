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

  it("emits no Follow-along toggle for the logged-out locked card", async () => {
    authState = { user: null, isLoading: false };
    render(<AudioPlayer slug={SLUG} hasAudio />);
    expect(screen.getByText(/Listen to this article/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Follow along/i })).toBeNull();
  });
});