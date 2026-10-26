/**
 * page.milestone.test.tsx — routing into the check from a range-end lesson (A6).
 *
 * The acceptance evidence for card A6, server-side only (no browser):
 *
 *  - a learner with ZERO progress on lesson 5 (the range end of check 1) gets
 *    the milestone panel and a Next override pointing at
 *    `/atlas/<series>/check/1` on FIRST PAINT — the panel is server-rendered,
 *    so it never waits for a client progress response;
 *  - once check 1 is passed, Next and the panel point at lesson 6 instead;
 *  - a guest issues no score query and claims no pass state, and the lesson
 *    body still renders;
 *  - a lesson that does not end a range gets neither panel nor override.
 *
 * The real `LessonNavigation` and `MilestonePanel` are rendered; only content,
 * data-access, auth and the client widgets are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    getLesson: vi.fn(),
    getLessonsForSeries: vi.fn((): unknown[] => []),
    getSeriesBySlug: vi.fn(),
    getKnowledgeChecks: vi.fn((): unknown[] => []),
    getQuizForLesson: vi.fn(() => null),
    loadCheckScore: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    loadSeriesConstellation: vi.fn(() => null),
  },
}));

const SERIES = "ai-at-work";

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

vi.mock("@/lib/learn", () => ({
  getLesson: mocks.getLesson,
  getLessonsForSeries: mocks.getLessonsForSeries,
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLearnMDXContent: () => "---\ntitle: x\n---\n# Lesson\n\nBody.",
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

vi.mock("@/lib/quiz", () => ({
  getKnowledgeChecks: mocks.getKnowledgeChecks,
  getQuizForLesson: mocks.getQuizForLesson,
}));

vi.mock("@/lib/check-scores", () => ({ loadCheckScore: mocks.loadCheckScore }));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => fakeSupabase.current,
}));

vi.mock("@/lib/atlas-launch", () => ({ isPubliclyLaunchedSeries: () => true }));
vi.mock("@/lib/atlas-disclosure", () => ({ mayDiscloseSeriesLive: async () => true }));
vi.mock("@/lib/sky-server", () => ({
  loadSeriesConstellation: mocks.loadSeriesConstellation,
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/BlogPost/ReadingProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/BlogPost/ShareBar", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/MarkComplete", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonCompleteProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonQuiz", () => ({
  default: () => <div data-testid="lesson-quiz" />,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: () => <div data-testid="guest-cta" />,
}));
vi.mock("@/components/MDX/MDXArticle", () => ({
  default: () => <article data-testid="mdx-body" />,
}));
vi.mock("@/components/BlogPost/AudioPlayerLazy", () => ({
  AudioPlayerLazy: () => <div />,
}));
vi.mock("@/components/Constellations/LessonCelebration", () => ({ default: () => <div /> }));
vi.mock("@/components/Catalog/Paywall", () => ({ default: () => <div /> }));

import LessonPage from "./page";

/** Chainable + awaitable supabase stub: the page awaits `.in()` and `.eq()`. */
function chain(result: unknown) {
  const promise = Promise.resolve({ data: result, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => promise,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      promise.then(resolve, reject),
  };
  return builder;
}

const fakeSupabase: { current: unknown } = { current: null };

function setClient(user: { id: string } | null) {
  fakeSupabase.current = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => chain([]),
  };
}

/** Lessons 1..6 of the fake series, in order. */
const lessons = Array.from({ length: 6 }, (_, i) => ({
  slug: `day-0${i + 1}`,
  series: SERIES,
  title: `Day ${i + 1}`,
  lesson: i + 1,
  excerpt: "e",
  date: "2026-10-01",
  author: "Adroit",
  readTime: "5 min read",
  tags: [],
}));

async function render(series: string, slug: string) {
  const { default: R } = await import("react-dom/server");
  const result = await LessonPage({ params: Promise.resolve({ series, slug }) });
  return R.renderToString(result as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReturnValue({
    slug: SERIES,
    name: "AI at Work",
    description: "d",
    gradient: "g",
    totalLessons: 6,
    examKind: "course-completion",
    lessons,
  });
  mocks.getLessonsForSeries.mockReturnValue(lessons);
  mocks.getLesson.mockImplementation((series: string, slug: string) =>
    series === SERIES ? (lessons.find((l) => l.slug === slug) ?? null) : null,
  );
  mocks.getKnowledgeChecks.mockReturnValue([{ n: 1, lessons: [1, 5] }]);
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.getAccessUserId.mockResolvedValue("u1");
  mocks.getCourseRowBySlug.mockResolvedValue({ id: "course-1" });
  mocks.loadCheckScore.mockResolvedValue({ bestScore: 0, passed: false });
  setClient(null);
});

describe("range-end lesson → route into the check (A6)", () => {
  it("zero-progress learner on lesson 5 gets the panel and a check Next on first paint", async () => {
    setClient({ id: "u1" });
    mocks.loadCheckScore.mockResolvedValue({ bestScore: 0, passed: false });

    const html = await render(SERIES, "day-05");

    // The pass state came from the authoritative single-check read, once.
    expect(mocks.loadCheckScore).toHaveBeenCalledTimes(1);
    expect(mocks.loadCheckScore).toHaveBeenCalledWith(expect.anything(), "u1", SERIES, 1);

    // Panel rendered, in the not-passed state.
    expect(html).toContain('data-milestone="check-1"');
    expect(html).toContain('data-milestone-passed="false"');
    expect(html).toContain("Take Knowledge Check 1");

    // Both the panel's primary action and the nav's next slot point at the
    // check, and the nav carries the range as its kicker.
    expect(html.match(/href="\/atlas\/ai-at-work\/check\/1"/g) ?? []).toHaveLength(2);
    expect(html).toContain("Knowledge Check 1");
    expect(html).toContain("Lessons 1–5");

    // No gating: the lesson body is still there.
    expect(html).toContain('data-testid="mdx-body"');
  });

  it("once check 1 is passed, Next and the panel continue to lesson 6", async () => {
    setClient({ id: "u1" });
    mocks.loadCheckScore.mockResolvedValue({ bestScore: 90, passed: true });

    const html = await render(SERIES, "day-05");

    expect(html).toContain('data-milestone-passed="true"');
    expect(html).toContain("Continue to Lesson 6");
    expect(html).toContain('href="/atlas/ai-at-work/day-06"');
    // Panel primary AND nav next slot are the lesson; nothing links into the
    // check on a passed range end.
    expect(html.match(/href="\/atlas\/ai-at-work\/day-06"/g) ?? []).toHaveLength(2);
    expect(html).not.toContain('href="/atlas/ai-at-work/check/1"');
  });

  it("a guest queries no scores and claims no pass state", async () => {
    setClient(null);

    const html = await render(SERIES, "day-05");

    expect(mocks.loadCheckScore).not.toHaveBeenCalled();
    expect(html).toContain('data-milestone-passed="false"');
    expect(html).toContain('data-testid="guest-cta"');
    // The lesson body renders normally for a guest.
    expect(html).toContain('data-testid="mdx-body"');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("a lesson that does not end a range gets no panel and no override", async () => {
    setClient({ id: "u1" });

    const html = await render(SERIES, "day-03");

    expect(mocks.loadCheckScore).not.toHaveBeenCalled();
    expect(html).not.toContain("data-milestone=");
    expect(html).toContain('href="/atlas/ai-at-work/day-04"');
    expect(html).not.toContain('href="/atlas/ai-at-work/check/1"');
  });
});
