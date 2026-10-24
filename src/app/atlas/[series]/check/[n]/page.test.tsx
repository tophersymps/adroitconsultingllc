/**
 * /atlas/[series]/check/[n] — degraded-path existence gate (F-2, t_c4eafa3b).
 *
 * R2-5 (t_34b0e6c3) makes a token-route failure degrade to the guest/paywall
 * view at 200 instead of 404/500. It must NOT, however, publish the EXISTENCE
 * of a stealth series: when the seam cannot decide, the page may only degrade
 * for a series the static launch mirror knows is live. Anything else 404s,
 * exactly as the healthy seam would.
 *
 * Both cases here fail on `origin/main` (before t_3b6d832e): the stealth route
 * rendered the locked-content shell at 200.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(() => []),
    getKnowledgeCheck: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getUser: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

vi.mock("@/data/learn", () => ({
  learnSeries: [{ slug: "omni-studio-cert" }, { slug: "ai-adoption" }],
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
  buildMetadata: (p: unknown) => p,
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/paywall", () => ({
  buildPaywallView: (args: { series: { slug: string } }) => ({
    seriesSlug: args.series.slug,
  }),
  buildDegradedPaywallView: (series: { slug: string }) => ({
    seriesSlug: series.slug,
  }),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/components/Catalog/LockedContentPage", () => ({
  LockedContentPage: ({ view }: { view: { seriesSlug: string } }) => (
    <div data-testid="locked" data-series={view.seriesSlug} />
  ),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/Progress/QuizWidget", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/GuestCTA", () => ({ default: () => <div /> }));

import Page from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const seriesInfo = (slug: string, name: string) => ({
  slug,
  name,
  description: "d",
  gradient: "g",
  totalLessons: 1,
  lessons: [{ slug: "day-01", title: "Day 1" }],
});

const checkFor = (series: string) => ({
  series,
  n: 1,
  title: "SECRET_CHECK_TITLE",
  lessons: [1, 2],
  questions: [{ question: "SECRET_QUESTION_TEXT", correct_answer_index: 1 }],
});

async function render(series: string) {
  const { default: R } = await import("react-dom/server");
  const result = await Page({
    params: Promise.resolve({ series, n: "1" }),
  });
  return R.renderToString(result as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessUserId.mockResolvedValue("u1");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getKnowledgeChecks.mockReturnValue([{ n: 1, lessons: [1, 2] }]);
  mocks.getKnowledgeCheck.mockImplementation((series: string) =>
    checkFor(series),
  );
});

describe("/atlas/[series]/check/[n] degraded existence gate (F-2)", () => {
  it("still degrades a LIVE series to the locked view at 200 — no question text", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("omni-studio-cert", "OmniStudio Developer Certification"),
    );
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await render("omni-studio-cert");

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="locked"');
    expect(html).toContain('data-series="omni-studio-cert"');
    expect(html).not.toContain("SECRET_QUESTION_TEXT");
  });

  it("404s a stealth series when the seam cannot decide", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("ai-adoption", "AI Adoption for Teams"),
    );
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(render("ai-adoption")).rejects.toThrow("NEXT_NOT_FOUND");
    // Fail-closed before any DB read.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});
