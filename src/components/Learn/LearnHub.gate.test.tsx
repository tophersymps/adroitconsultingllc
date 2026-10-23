/**
 * LearnHub gate upgrade — A11Y-M1 acceptance (t_80131e31).
 *
 * The /atlas page is prerendered with the guest projection, so the SERVER
 * markup for a card is "Sign in to track progress" + a plain-text <h3>. After
 * hydration the island reads GET /api/atlas/cards and a signed-in visitor must
 * get the real affordances: a reachable title link + SeriesProgress instead of
 * the sign-in CTA. These tests pin both halves — the guest SSR baseline and
 * the post-hydration upgrade.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LearnHub from "./LearnHub";
import type { LearnCardSeries } from "@/data/types";

vi.mock("./ContinueLearning", () => ({ default: () => null }));
vi.mock("@/components/Progress/SeriesProgress", () => ({
  default: ({ lessonSlugs }: { lessonSlugs: string[] }) => (
    <div data-testid="series-progress" data-lessons={lessonSlugs.join(",")} />
  ),
}));
vi.mock("@/components/Progress/QuizStats", () => ({
  default: () => <div data-testid="quiz-stats" />,
}));
vi.mock("@/components/Constellations/PathConstellation", () => ({
  default: () => <div data-testid="constellation" />,
}));

function card(overrides: Partial<LearnCardSeries>): LearnCardSeries {
  return {
    slug: "agentic-ai",
    name: "Agentic AI",
    description: "desc",
    gradient: "from-navy to-navy-light",
    lessonCount: 2,
    totalLessons: 2,
    lessonSlugs: [],
    section: { slug: "certifications", name: "Certifications" },
    group: null,
    track: null,
    level: null,
    sortOrder: 0,
    difficulty: null,
    canAccess: false,
    ...overrides,
  };
}

const courses = [card({})];
const sections = [{ slug: "certifications", name: "Certifications" }];

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("LearnHub — A11Y-M1 gate upgrade", () => {
  it("server-renders the guest projection (stable SSR/hydration baseline)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    const { renderToString } = await import("react-dom/server");

    const html = renderToString(
      <LearnHub courses={courses} gate="guest-locked" sections={sections} groups={[]} />,
    );

    expect(html).toContain("Sign in to access courses");
    expect(html).toContain("Sign in to track progress on this path");
    // No crawlable series link in the static projection — the CTA is /login.
    expect(html).not.toContain('href="/atlas/agentic-ai"');
  });

  it("upgrades a signed-in visitor after hydration: title link + real progress, no sign-in CTA", async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          gate: "signed-in",
          series: [
            { slug: "agentic-ai", canAccess: true, lessonSlugs: ["agentic-ai-1", "agentic-ai-2"] },
          ],
        }),
      }) as unknown as Response,
    ) as never;

    render(<LearnHub courses={courses} gate="guest-locked" sections={sections} groups={[]} />);

    const titleLink = await screen.findByRole("link", { name: "Agentic AI" });
    expect(titleLink).toHaveAttribute("href", "/atlas/agentic-ai");
    await waitFor(() =>
      expect(screen.queryByText(/sign in to access courses/i)).toBeNull(),
    );
    expect(screen.queryByText(/sign in to track progress/i)).toBeNull();
    expect(screen.getByTestId("series-progress")).toHaveAttribute(
      "data-lessons",
      "agentic-ai-1,agentic-ai-2",
    );
  });

  it("leaves the guest projection untouched for guests", async () => {
    globalThis.fetch = vi.fn(async () =>
      ({ ok: true, json: async () => ({ gate: "guest-locked", series: [] }) }) as unknown as Response,
    ) as never;

    render(<LearnHub courses={courses} gate="guest-locked" sections={sections} groups={[]} />);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/atlas/cards", { cache: "no-store" }),
    );
    expect(screen.getByText(/sign in to access courses/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Agentic AI" })).toBeNull();
  });
});
