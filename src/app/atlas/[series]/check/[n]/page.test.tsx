/**
 * src/app/atlas/[series]/check/[n]/page.test.tsx — the knowledge-check route
 * must fail CLOSED on the `unavailable` access decision (SECURITY t_c4eafa3b
 * F-2, CWE-200; fix t_64253bbc).
 *
 * Before the fix an `unavailable` decision skipped both the `not-launched`
 * (404) and `paywall` branches, so the page rendered a 200 "Knowledge Check N"
 * page for ANY series — publishing the existence of unpublished/stealth
 * courses during a token-mint outage.
 *
 * Contract now:
 *   unavailable + statically launched -> availability notice, no check text
 *   unavailable + stealth/unknown     -> 404
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(),
    getKnowledgeCheck: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    buildPaywallView: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/data/learn", () => ({
  learnSeries: [{ slug: "omni-studio-cert" }, { slug: "hermes-consultant" }],
}));

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLessonsForSeries: mocks.getLessonsForSeries,
}));

vi.mock("@/lib/quiz", () => ({
  getKnowledgeCheck: mocks.getKnowledgeCheck,
  getKnowledgeChecks: mocks.getKnowledgeChecks,
}));

vi.mock("@/lib/seo", () => ({
  buildMetadata: (p: { title: string }) => ({ title: p.title }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/paywall", () => ({ buildPaywallView: mocks.buildPaywallView }));

vi.mock("@/lib/db/server", () => {
  class DbAuthUnavailableError extends Error {
    readonly code = "DB_AUTH_UNAVAILABLE";
  }
  return {
    DbAuthUnavailableError,
    getSupabaseServerClient: vi.fn(async () => {
      throw new DbAuthUnavailableError();
    }),
  };
});

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/Progress/QuizWidget", () => ({
  default: () => <div data-testid="quiz-widget">QUIZ-QUESTION-TEXT</div>,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: ({ tier }: { tier: string }) => <div data-testid="guest-cta">guest-cta-{tier}</div>,
}));
vi.mock("@/components/Catalog/LockedContentPage", () => ({
  LockedContentPage: () => <div data-testid="locked-content">LOCKED</div>,
}));

import Page from "./page";

const SERIES = (over: Record<string, unknown> = {}) => ({
  slug: "omni-studio-cert",
  name: "OmniStudio Developer Certification",
  description: "d",
  gradient: "g",
  totalLessons: 8,
  lessons: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReturnValue(SERIES());
  mocks.getLessonsForSeries.mockReturnValue([{ slug: "l1", title: "Lesson 1: Intro" }]);
  mocks.getKnowledgeChecks.mockReturnValue([
    { n: 1, lessons: [1, 15], title: "Check 1" },
  ]);
  mocks.getKnowledgeCheck.mockReturnValue({
    n: 1,
    quizName: "omni-studio-cert:check:1",
    title: "Knowledge Check 1",
    description: "First check",
    lessons: [1, 15],
    questions: [{ question: "SECRET-QUESTION-TEXT?", options: ["a", "b"] }],
  });
  mocks.getCourseRowBySlug.mockResolvedValue(null);
  mocks.buildPaywallView.mockReturnValue({});
  mocks.getAccessUserId.mockResolvedValue(null);
});

async function render(series = "omni-studio-cert"): Promise<string> {
  const result = await Page({ params: Promise.resolve({ series, n: "1" }) });
  const { default: R } = await import("react-dom/server");
  return R.renderToString(result as never);
}

describe("/atlas/[series]/check/[n] — `unavailable` must fail CLOSED (F-2)", () => {
  it("a LAUNCHED series under an outage shows an availability notice and no check text", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    const html = await render("omni-studio-cert");

    expect(html).toContain('data-testid="atlas-unavailable"');
    expect(html).not.toContain("SECRET-QUESTION-TEXT");
    expect(html).not.toContain("Knowledge Check 1");
    expect(html).not.toContain('data-testid="quiz-widget"');
  });

  it("a STEALTH series under an outage 404s instead of naming the course", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });
    mocks.getSeriesBySlug.mockReturnValue(
      SERIES({ slug: "hermes-consultant", name: "Hermes Agent Consultant" }),
    );
    mocks.getKnowledgeCheck.mockReturnValue({
      n: 1,
      quizName: "hermes-consultant:check:1",
      title: "Knowledge Check 1",
      description: "x",
      lessons: [1, 15],
      questions: [],
    });

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("not-launched still 404s", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(render("omni-studio-cert")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("a guest on a granted series still gets the CTA, never question text", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });

    const html = await render("omni-studio-cert");

    expect(html).toMatch(/guest-cta-(<!-- -->)?check/);
    expect(html).not.toContain("SECRET-QUESTION-TEXT");
  });
});
