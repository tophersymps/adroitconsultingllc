/**
 * src/app/atlas/[series]/[slug]/page.test.tsx — the lesson gate must fail
 * CLOSED on the `unavailable` access decision (SECURITY t_c4eafa3b F-1,
 * HIGH, CWE-285 / CWE-693 / CWE-200; fix t_64253bbc).
 *
 * The failure this locks: `decideCourseAccess()` returns `{kind:
 * "unavailable"}` when the Data API credential bridge cannot mint a JWT
 * (t_223f8b3d). The lesson page only branched on `not-launched` (404) and
 * `paywall`, so `unavailable` fell through to the normal render and shipped
 * the full `mdxBody` with `isAuthed=false` — any token-mint outage (the Neon
 * Auth 429, or guest-driven mint-bucket exhaustion) published every gated
 * lesson and every stealth series' content.
 *
 * Contract now:
 *   not-launched                     -> 404 (stealth stays hidden)
 *   paywall                          -> paywall, NO body
 *   unavailable + statically launched-> availability notice, NO body
 *   unavailable + stealth/unknown    -> 404 (existence stays hidden)
 *   granted                          -> body renders
 *
 * Discrimination: on e0bf096a the `unavailable` case renders
 * GATED_LESSON_BODY, so this file fails there and passes here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getLesson: vi.fn(),
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(),
    getLearnMDXContent: vi.fn(),
    stripMDXFrontmatter: vi.fn(),
    stripLessonTitleH1: vi.fn(),
    getAuthorInitials: vi.fn(),
    toIsoDate: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getQuizForLesson: vi.fn(),
    getCompletedLessonSlugs: vi.fn(),
    loadSeriesConstellation: vi.fn(),
    buildPaywallView: vi.fn(),
    linkifySourceCitations: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const GATED_LESSON_BODY = "GATED-LESSON-BODY-SECRET-PARAGRAPH";

vi.mock("@/lib/learn", () => ({
  getLesson: mocks.getLesson,
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLessonsForSeries: mocks.getLessonsForSeries,
  getLearnMDXContent: mocks.getLearnMDXContent,
  stripMDXFrontmatter: mocks.stripMDXFrontmatter,
  stripLessonTitleH1: mocks.stripLessonTitleH1,
  getAuthorInitials: mocks.getAuthorInitials,
  toIsoDate: mocks.toIsoDate,
}));

vi.mock("@/lib/mdx", () => ({
  linkifySourceCitations: mocks.linkifySourceCitations,
}));

vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://example.test" },
  buildMetadata: (p: { title: string }) => ({ title: p.title }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/paywall", () => ({ buildPaywallView: mocks.buildPaywallView }));

vi.mock("@/lib/quiz", () => ({ getQuizForLesson: mocks.getQuizForLesson }));

vi.mock("@/lib/completion", () => ({
  getCompletedLessonSlugs: mocks.getCompletedLessonSlugs,
}));

vi.mock("@/lib/sky-server", () => ({
  loadSeriesConstellation: mocks.loadSeriesConstellation,
}));

vi.mock("@/data/lesson-audio", () => ({ lessonAudio: [] }));

// The credential bridge is DOWN for this whole file: any path that still
// builds a Data API client just to answer "who is reading" throws here.
vi.mock("@/lib/db/server", () => {
  class DbAuthUnavailableError extends Error {
    readonly code = "DB_AUTH_UNAVAILABLE";
    constructor() {
      super("Neon Auth did not mint a Data API JWT for this request");
      this.name = "DbAuthUnavailableError";
    }
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
vi.mock("@/components/BlogPost/ReadingProgress", () => ({
  default: () => <div data-testid="reading-progress" />,
}));
vi.mock("@/components/BlogPost/ShareBar", () => ({
  default: () => <div data-testid="share-bar" />,
}));
vi.mock("@/components/Learn/LessonNavigation", () => ({
  default: () => <nav data-testid="lesson-nav" />,
}));
vi.mock("@/components/MDX/MDXArticle", () => ({
  default: ({ mdx }: { mdx: string }) => (
    <article data-testid="mdx-body">{mdx}</article>
  ),
}));
vi.mock("@/components/Catalog/Paywall", () => ({
  default: () => <div data-testid="paywall">PAYWALL</div>,
}));
vi.mock("@/components/BlogPost/AudioPlayerLazy", () => ({
  AudioPlayerLazy: () => <div data-testid="audio" />,
}));
vi.mock("@/components/Progress/MarkComplete", () => ({
  default: () => <div data-testid="mark-complete" />,
}));
vi.mock("@/components/Progress/LessonCompleteProgress", () => ({
  default: () => <div data-testid="lesson-progress" />,
}));
vi.mock("@/components/Progress/LessonQuiz", () => ({
  default: () => <div data-testid="quiz">QUIZ-QUESTION-TEXT</div>,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: ({ tier }: { tier: string }) => <div data-testid="guest-cta">guest-cta-{tier}</div>,
}));
vi.mock("@/components/Constellations/LessonCelebration", () => ({
  default: () => <div data-testid="celebration" />,
}));

import Page from "./page";

const SERIES_INFO = {
  slug: "omni-studio-cert",
  name: "OmniStudio Developer Certification",
  description: "A certification path.",
  gradient: "from-a to-b",
  totalLessons: 8,
  lessons: [],
};

const LESSON = {
  slug: "intro-lesson",
  title: "Lesson 1: Intro",
  series: "omni-studio-cert",
  lesson: 1,
  excerpt: "x",
  date: "August 01, 2026",
  author: "Adroit Consulting",
  readTime: "5 min read",
  tags: [],
  status: "published",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLesson.mockReturnValue(LESSON);
  mocks.getSeriesBySlug.mockReturnValue(SERIES_INFO);
  mocks.getLessonsForSeries.mockReturnValue([LESSON]);
  mocks.getLearnMDXContent.mockReturnValue("---\nx\n---\n" + GATED_LESSON_BODY);
  mocks.stripMDXFrontmatter.mockReturnValue(GATED_LESSON_BODY);
  mocks.stripLessonTitleH1.mockReturnValue(GATED_LESSON_BODY);
  mocks.linkifySourceCitations.mockReturnValue(GATED_LESSON_BODY);
  mocks.getAuthorInitials.mockReturnValue("AC");
  mocks.toIsoDate.mockReturnValue("2026-08-01");
  mocks.getCourseRowBySlug.mockResolvedValue(null);
  mocks.getQuizForLesson.mockReturnValue({
    quizName: "omni-studio-cert:lesson:intro-lesson",
    questions: [{ question: "Q?", options: ["a", "b"] }],
  });
  mocks.getCompletedLessonSlugs.mockResolvedValue(new Set<string>());
  mocks.loadSeriesConstellation.mockResolvedValue(null);
  mocks.buildPaywallView.mockReturnValue({});
  mocks.getAccessUserId.mockResolvedValue(null);
});

async function render(series = "omni-studio-cert"): Promise<string> {
  const result = await Page({
    params: Promise.resolve({ series, slug: "intro-lesson" }),
  });
  const { default: R } = await import("react-dom/server");
  return R.renderToString(result as never);
}

describe("/atlas/[series]/[slug] — `unavailable` must fail CLOSED (t_c4eafa3b F-1)", () => {
  it("a LAUNCHED series under an outage renders an availability notice and NO lesson body", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    const html = await render("omni-studio-cert");

    expect(html).toContain('data-testid="atlas-unavailable"');
    expect(html).toContain("temporarily unavailable");
    // The whole point: the gated body never reaches the HTML.
    expect(html).not.toContain(GATED_LESSON_BODY);
    expect(html).not.toContain('data-testid="mdx-body"');
    // …and neither does the paywall's gated peek/quiz text.
    expect(html).not.toContain('data-testid="paywall"');
    expect(html).not.toContain("QUIZ-QUESTION-TEXT");
  });

  it("a STEALTH series under an outage 404s (its existence stays hidden)", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });
    mocks.getSeriesBySlug.mockReturnValue({
      ...SERIES_INFO,
      slug: "hermes-consultant",
      name: "Hermes Agent Consultant",
    });

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("not-launched still 404s (healthy stealth course)", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("paywall withholds the body", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    mocks.getCourseRowBySlug.mockResolvedValue({ id: "c1", series_slug: "omni-studio-cert" });

    const html = await render("omni-studio-cert");

    expect(html).toContain('data-testid="paywall"');
    expect(html).not.toContain(GATED_LESSON_BODY);
    expect(html).not.toContain('data-testid="mdx-body"');
  });

  it("a granted decision still renders the lesson body (gate not neutered)", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });

    const html = await render("omni-studio-cert");

    expect(html).toContain('data-testid="mdx-body"');
    expect(html).toContain(GATED_LESSON_BODY);
    expect(html).not.toContain('data-testid="atlas-unavailable"');
  });
});
