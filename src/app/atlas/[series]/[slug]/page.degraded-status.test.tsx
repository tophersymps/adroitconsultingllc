/**
 * page.degraded-status.test.tsx — the R2-5 A11Y-M1 pinned regression (t_8d1638a7).
 *
 * Split from `page.degraded.test.tsx` (origin/main, t_ffe32443) when the two
 * branches both added that path: the sibling suite stubs `fetch` and drives the
 * REAL route/access seam to pin the forced-429 contract (paywall at 200, zero
 * Data API calls, no quiz payload), while this suite mocks the access seam to
 * pin the status-region contract on the real Paywall component. Different mock
 * graphs cannot share one module file, so both intents live side by side here.
 *
 * `buildDegradedPaywallView` renders the ordinary "this course is locked"
 * paywall when the anonymous Data API token cannot be resolved. That is a
 * fail-closed guess, not an access decision: a signed-in ENTITLED member sees a
 * false access denial, and a screen-reader user is told nothing about the page
 * being provisional.
 *
 * Contract: the degraded state is announced in a `role="status"`
 * `aria-live="polite"` region ("temporarily unavailable" copy) rendered IN
 * ADDITION to the paywall, distinguished by text rather than colour alone,
 * leaking no internals — and it must NOT appear on an ordinary signed-out
 * paywall.
 */
/**
 * page.degraded.test.tsx — the R2-5 A11Y-M1 pinned regression (t_8d1638a7).
 *
 * `buildDegradedPaywallView` renders the ordinary "this course is locked"
 * paywall when the anonymous Data API token cannot be resolved. That is a
 * fail-closed guess, not an access decision: a signed-in ENTITLED member sees a
 * false access denial, and a screen-reader user is told nothing about the page
 * being provisional.
 *
 * Contract: the degraded state is announced in a `role="status"`
 * `aria-live="polite"` region ("temporarily unavailable" copy) rendered IN
 * ADDITION to the paywall, distinguished by text rather than colour alone,
 * leaking no internals — and it must NOT appear on an ordinary signed-out
 * paywall.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAccessUserId: vi.fn(),
    decideCourseAccess: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getUser: vi.fn(),
    notFound: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/data/learn", () => ({
  learnSeries: [{ slug: "omni-studio-cert" }],
}));

const LESSONS = [
  { slug: "lesson-one", title: "Lesson 1: Declarative OmniStudio", number: 1 },
  { slug: "lesson-two", title: "Lesson 2: OmniScript Patterns", number: 2 },
];

const SERIES = {
  slug: "omni-studio-cert",
  name: "OmniStudio Developer Certification",
  description: "Build declarative OmniStudio solutions.",
  gradient: "from-a to-b",
  totalLessons: LESSONS.length,
  lessons: LESSONS,
};

vi.mock("@/lib/learn", () => ({
  getLesson: (series: string, slug: string) =>
    series === SERIES.slug ? LESSONS.find((l) => l.slug === slug) ?? null : null,
  getSeriesBySlug: (slug: string) => (slug === SERIES.slug ? SERIES : null),
  getLessonsForSeries: () => LESSONS,
  getLearnMDXContent: () => "# Lesson\nbody",
  stripMDXFrontmatter: (s: string) => s,
  stripLessonTitleH1: (s: string) => s,
  toIsoDate: () => "2026-01-01",
  getAuthorInitials: () => "AB",
}));

vi.mock("@/lib/mdx", () => ({ linkifySourceCitations: (s: string) => s }));
vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://example.test" },
  buildMetadata: (p: unknown) => p,
}));
vi.mock("@/lib/quiz", () => ({
  getQuizForLesson: () => null,
  getKnowledgeChecks: () => [],
}));
vi.mock("@/data/lesson-audio", () => ({ lessonAudio: [] }));
vi.mock("@/lib/sky-server", () => ({ loadSeriesConstellation: () => null }));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/BlogPost/ReadingProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/BlogPost/ShareBar", () => ({ default: () => <div /> }));
vi.mock("@/components/BlogPost/AudioPlayerLazy", () => ({
  AudioPlayerLazy: () => <div />,
}));
vi.mock("@/components/Learn/LessonNavigation", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/MarkComplete", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonCompleteProgress", () => ({
  default: () => <div />,
}));
vi.mock("@/components/Progress/LessonQuiz", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/GuestCTA", () => ({ default: () => <div /> }));
vi.mock("@/components/MDX/MDXArticle", () => ({ default: () => <div /> }));
vi.mock("@/components/Constellations/LessonCelebration", () => ({
  default: () => <div />,
}));

import Page from "./page";
import { DEGRADED_PAYWALL_MESSAGE } from "@/components/Catalog/Paywall";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const COURSE_ROW = {
  slug: SERIES.slug,
  access_model: "subscription",
  price_cents: 4900,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessUserId.mockResolvedValue(null);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

async function renderLesson(series = SERIES.slug, slug = "lesson-one") {
  const { default: R } = await import("react-dom/server");
  const result = await Page({ params: Promise.resolve({ series, slug }) });
  return R.renderToString(result as never);
}

describe("/atlas/[series]/[slug] degraded paywall (A11Y-M1)", () => {
  it("announces a temporary-unavailable status region when the token path fails", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await renderLesson();

    // Rendered at 200, not 404.
    expect(mocks.notFound).not.toHaveBeenCalled();
    // A polite live region exists and carries the degraded copy.
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toContain(DEGRADED_PAYWALL_MESSAGE);
    // …in addition to the paywall lock UI, not instead of it.
    expect(html).toContain("Members-only content");
    expect(html).toContain("This course is locked for you right now");
    // No internals leak into the user-facing copy.
    expect(html).not.toMatch(/token\/anonymous|DbTokenUnavailableError|429|401|500/i);
    // Landmark structure unchanged: exactly one <main id="main">.
    expect(html.match(/<main id="main"/g) ?? []).toHaveLength(1);
  });

  it("does NOT render the status region on an ordinary signed-out paywall", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    mocks.getCourseRowBySlug.mockResolvedValue(COURSE_ROW);

    const html = await renderLesson();

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain("Members-only content");
    expect(html).not.toMatch(/role="status"/);
    expect(html).not.toContain(DEGRADED_PAYWALL_MESSAGE);
    expect(html).not.toMatch(/temporarily unavailable/i);
  });
});
