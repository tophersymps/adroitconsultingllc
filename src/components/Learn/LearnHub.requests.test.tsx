/**
 * LearnHub request budget — PERF-MEDIUM acceptance (t_22e18719).
 *
 * The prerendered /atlas hub upgrades itself after hydration
 * (`useCardGateUpgrade` + one `SeriesProgress` / `QuizStats` per card). Before
 * this fix, the signed-in projection fired:
 *   1 × GET /api/atlas/cards
 *   N × GET /api/auth/session   (every `QuizStats` mounted its own `useAuth`)
 *   N × GET /api/progress/summary (every `SeriesProgress` had its own hook copy)
 *   N × GET /api/progress/quiz/run (one per card's quiz strip)
 * — 19 requests at the 9-card production size (sato's probe on PR #358).
 *
 * These tests mount the REAL components (no component mocks) and count
 * requests by URL against the acceptance budget:
 *   - signed-in, 9 cards → ≤ 3 post-hydration requests
 *   - guest               → still exactly 1 (no identity read, no progress read)
 *
 * The guest half is the regression guard: `/atlas` must keep building as ○, so
 * nothing here may turn into a per-visitor server identity read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LearnHub from "./LearnHub";
import { invalidateAuthSession } from "@/lib/hooks/useAuth";
import { invalidateProgressSummary } from "@/lib/hooks/useProgressSummary";
import type { LearnCardSeries } from "@/data/types";

vi.mock("./ContinueLearning", () => ({ default: () => null }));
vi.mock("@/components/Constellations/PathConstellation", () => ({
  default: () => <div data-testid="constellation" />,
}));

const SERIES_COUNT = 9;

function card(i: number): LearnCardSeries {
  return {
    slug: `series-${i}`,
    name: `Series ${i}`,
    description: `desc ${i}`,
    gradient: "from-navy to-navy-light",
    lessonCount: 3,
    totalLessons: 3,
    lessonSlugs: [],
    section: { slug: "certifications", name: "Certifications" },
    group: null,
    track: null,
    level: null,
    sortOrder: i,
    difficulty: null,
    canAccess: false,
  };
}

const courses = Array.from({ length: SERIES_COUNT }, (_, i) => card(i + 1));
const sections = [{ slug: "certifications", name: "Certifications" }];

/** URL → response body for the routes the hub may call. */
function respond(url: string, signedIn: boolean): unknown {
  if (url === "/api/auth/session") {
    return { user: signedIn ? { id: "u1", email: "a@b.co", isAdmin: false } : null };
  }
  if (url === "/api/atlas/cards") {
    if (!signedIn) return { gate: "guest-locked", series: [] };
    return {
      gate: "signed-in",
      series: courses.map((c) => ({
        slug: c.slug,
        canAccess: true,
        lessonSlugs: [`${c.slug}-1`, `${c.slug}-2`, `${c.slug}-3`],
      })),
    };
  }
  if (url === "/api/progress/summary") {
    return {
      readContent: { blog: [], lesson: [] },
      completedLessons: ["series-1-1"],
      quizStats: { "series-1": { bestScore: 82, attempts: 3 } },
    };
  }
  return {};
}

function installFetch(signedIn: boolean) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push(url);
    return {
      ok: true,
      json: async () => respond(url, signedIn),
    } as unknown as Response;
  }) as never;
  return calls;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  window.localStorage.clear();
  // The session + summary reads are module-level (per real session); reset them
  // so each test measures its own first load, like a fresh page visit.
  invalidateAuthSession();
  invalidateProgressSummary();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("LearnHub request budget (PERF t_22e18719)", () => {
  it(`signed-in with ${SERIES_COUNT} cards issues at most 3 API requests`, async () => {
    const calls = installFetch(true);

    render(<LearnHub courses={courses} gate="guest-locked" sections={sections} groups={[]} />);

    // The upgrade lands (title links) and the progress bars render.
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /^Series \d+$/ })).toHaveLength(SERIES_COUNT),
    );
    // Every card now has a real progress bar instead of the sign-in CTA.
    await waitFor(() =>
      expect(screen.queryByText(/sign in to track progress/i)).toBeNull(),
    );

    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.filter((u) => u === "/api/atlas/cards")).toHaveLength(1);
    expect(calls.filter((u) => u === "/api/auth/session")).toHaveLength(1);
    expect(calls.filter((u) => u === "/api/progress/summary")).toHaveLength(1);
    // The per-card quiz fan-out is gone.
    expect(calls.filter((u) => u.startsWith("/api/progress/quiz/run"))).toHaveLength(0);
  });

  it("guest path stays at exactly 1 request (the card upgrade probe only)", async () => {
    const calls = installFetch(false);

    render(<LearnHub courses={courses} gate="guest-locked" sections={sections} groups={[]} />);

    await waitFor(() =>
      expect(calls).toContain("/api/atlas/cards"),
    );
    // Let any (wrong) follow-up fetches settle before asserting.
    await new Promise((r) => setTimeout(r, 20));

    expect(calls).toEqual(["/api/atlas/cards"]);
    expect(screen.getAllByText(/sign in to track progress on this path/i)).toHaveLength(
      SERIES_COUNT,
    );
  });
});
