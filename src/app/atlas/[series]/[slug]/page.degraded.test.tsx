/**
 * page.degraded.test.tsx — R2-5 forced-429 regression for the lesson route
 * `/atlas/[series]/[slug]` (t_ffe32443, AC-6).
 *
 * The lesson page is the surface where a degradation could leak the answer key:
 * the server-side quiz branch is guarded by `isAuthed`, so the failure to pin is
 * that a token outage must land in the GUEST/paywall view at 200 — no 404 (the
 * course is live), no 5xx, and NOT ONE byte of quiz question text or
 * `correct_answer_index` in the serialised HTML.
 *
 * Only `fetch` is stubbed for the token routes; the real page, `db/server.ts`,
 * the access seam and `lib/paywall.ts` run. Content/component modules are
 * stubbed so the assertion is about the degradation branch, not MDX rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock, notFoundMock, quizMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  quizMock: {
    getQuizForLesson: vi.fn(() => ({
      questions: [
        {
          question: "SECRET_QUESTION_TEXT_SHOULD_NEVER_SHIP",
          options: ["a", "b"],
          correct_answer_index: 1,
        },
      ],
    })),
  },
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

vi.mock("@/lib/learn", () => ({
  getLesson: (series: string, slug: string) =>
    series === "omni-studio-cert" && slug === "day-01"
      ? {
          slug,
          series,
          title: "Day 1 — OmniStudio solutions",
          lesson: 1,
          excerpt: "Remove friction from the flow.",
          date: "2026-10-01",
          author: "Adroit",
          tags: ["omnistudio"],
        }
      : null,
  getSeriesBySlug: (slug: string) =>
    slug === "omni-studio-cert"
      ? {
          slug,
          name: "OmniStudio Developer Certification",
          description: "Build declarative OmniStudio solutions.",
          gradient: "from-a to-b",
          totalLessons: 1,
          lessons: [{ slug: "day-01", title: "Day 1 — OmniStudio solutions" }],
        }
      : null,
  getLessonsForSeries: () => [
    { slug: "day-01", title: "Day 1 — OmniStudio solutions", number: 1 },
  ],
  getLearnMDXContent: () => "---\ntitle: x\n---\n# Day 1\n\nBody.",
  stripMDXFrontmatter: (raw: string) => raw,
  stripLessonTitleH1: (raw: string) => raw,
  toIsoDate: (d: string) => d,
  getAuthorInitials: () => "AD",
}));

vi.mock("@/lib/mdx", () => ({ linkifySourceCitations: (raw: string) => raw }));
vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://example.test" },
  buildMetadata: (p: unknown) => p,
}));
vi.mock("@/lib/quiz", () => quizMock);
vi.mock("@/lib/sky-server", () => ({ loadSeriesConstellation: () => null }));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/BlogPost/ReadingProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/BlogPost/ShareBar", () => ({ default: () => <div /> }));
vi.mock("@/components/Learn/LessonNavigation", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/MarkComplete", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonCompleteProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonQuiz", () => ({
  default: () => <div data-testid="lesson-quiz" />,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({ default: () => <div /> }));
vi.mock("@/components/MDX/MDXArticle", () => ({ default: () => <article /> }));
vi.mock("@/components/BlogPost/AudioPlayerLazy", () => ({ AudioPlayerLazy: () => <div /> }));
vi.mock("@/components/Constellations/LessonCelebration", () => ({ default: () => <div /> }));
vi.mock("@/components/Catalog/Paywall", () => ({
  default: ({ seriesSlug }: { seriesSlug: string }) => (
    <div data-testid="paywall" data-series={seriesSlug} />
  ),
}));

import LessonPage from "./page";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

let captured: CapturedRequest[] = [];

async function renderLesson(): Promise<string> {
  const { default: R } = await import("react-dom/server");
  const result = await LessonPage({
    params: Promise.resolve({ series: "omni-studio-cert", slug: "day-01" }),
  });
  return R.renderToString(result as never);
}

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  notFoundMock.mockClear();
  quizMock.getQuizForLesson.mockClear();
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("/atlas/[series]/[slug] under a token-route 429 (R2-5, AC-6)", () => {
  it("still answers the guest/paywall view at 200 — never a 404 for a live course", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const html = await renderLesson();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="paywall"');
    expect(html).toContain('data-series="omni-studio-cert"');
    expect(html).not.toMatch(/not launched|coming soon/i);
  });

  it("serialises no quiz question text and no answer key", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const html = await renderLesson();

    expect(html).not.toContain("SECRET_QUESTION_TEXT_SHOULD_NEVER_SHIP");
    expect(html).not.toContain("correct_answer_index");
    expect(html).not.toContain("correctAnswerIndex");
    expect(html).not.toContain('data-testid="lesson-quiz"');
  });

  it("reads the course row only after a token exists — zero Data API calls here", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    await renderLesson();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
