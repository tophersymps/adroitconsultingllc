/**
 * page.degraded.test.tsx — the R2-5 pinned regression (t_34b0e6c3).
 *
 * Triage t_2fdc4d06 observed `/atlas/omni-studio-cert` answering **500** once
 * `${NEON_AUTH_BASE_URL}/token/anonymous` started rate-limiting: the access
 * seam threw the Data API's "missing authentication credentials" error, the
 * page had no handler for it, and the syllabus died with it.
 *
 * The contract (lois t_32c1c4ea §2.1): a token-route failure degrades to the
 * GUEST view of a live public page. It must still answer 200, still render the
 * static syllabus from `src/data/learn.ts`, and must NOT turn into a 404 —
 * `not-launched` would destroy SEO for a course that is live.
 *
 * The error is classified (`DbTokenUnavailableError`), never a blanket catch:
 * any other loader error keeps propagating.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAccessUserId: vi.fn(),
    decideCourseAccess: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getCatalogForUserV2: vi.fn(),
    getCompletedLessonSlugs: vi.fn(),
    getCompletedCourseIds: vi.fn(),
    loadExamPassedBySeries: vi.fn(),
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
  // `ai-adoption` is a STEALTH series: present in the static catalogue, no live
  // `courses` row. It is here for the F-2 existence test below.
  learnSeries: [{ slug: "omni-studio-cert" }, { slug: "ai-adoption" }],
}));

const LESSONS = [
  { slug: "lesson-one", title: "Lesson 1: Declarative OmniStudio", number: 1 },
  { slug: "lesson-two", title: "Lesson 2: OmniScript Patterns", number: 2 },
];

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: (slug: string) =>
    slug === "omni-studio-cert"
      ? {
          slug,
          name: "OmniStudio Developer Certification",
          description: "Build declarative OmniStudio solutions.",
          gradient: "from-a to-b",
          totalLessons: LESSONS.length,
          lessons: LESSONS,
        }
      : slug === "ai-adoption"
        ? {
            slug,
            name: "AI Adoption for Teams",
            description: "Unpublished stealth syllabus.",
            gradient: "from-a to-b",
            totalLessons: LESSONS.length,
            lessons: LESSONS,
          }
        : null,
  getLessonsForSeries: () => LESSONS,
  getSeriesProgress: () => ({
    published: LESSONS.length,
    total: LESSONS.length,
    curriculum: LESSONS.length,
  }),
  seriesShortLabel: (slug: string) => slug.toUpperCase(),
}));

vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://example.test" },
  buildMetadata: (p: unknown) => p,
}));

vi.mock("@/lib/quiz", () => ({
  getKnowledgeChecks: () => [],
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: mocks.getCatalogForUserV2,
  prerequisitesMet: () => true,
}));

vi.mock("@/lib/completion", () => ({
  getCompletedLessonSlugs: mocks.getCompletedLessonSlugs,
  getCompletedCourseIds: mocks.getCompletedCourseIds,
}));

vi.mock("@/lib/sky-server", () => ({
  loadSeriesConstellation: () => null,
  loadExamPassedBySeries: mocks.loadExamPassedBySeries,
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/Learn/LessonProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/SeriesProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/QuizStats", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/CertReadiness", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/CheckCardList", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/ExamCard", () => ({ default: () => <div /> }));
vi.mock("@/components/Catalog/StatusBadge", () => ({
  StatusBadge: () => <div />,
}));
vi.mock("@/components/Catalog/AccessModelChip", () => ({
  AccessModelChip: () => <div />,
}));
vi.mock("@/components/Learn/DifficultyPill", () => ({ default: () => <div /> }));
vi.mock("@/components/Learn/PrerequisitesSection", () => ({
  default: () => <div />,
}));
vi.mock("@/components/Learn/EmptyState", () => ({ default: () => <div /> }));
vi.mock("@/components/Learn/SeriesSyllabus", () => ({
  default: ({ lessons }: { lessons: { slug: string; title: string }[] }) => (
    <ul data-testid="syllabus">
      {lessons.map((l) => (
        <li key={l.slug}>
          <a href={`/atlas/omni-studio-cert/${l.slug}`}>{l.title}</a>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/Constellations/chart/SeriesStarChart", () => ({
  default: () => <div />,
}));

import Page from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessUserId.mockResolvedValue(null);
  mocks.getCatalogForUserV2.mockResolvedValue({ courses: [] });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.loadExamPassedBySeries.mockResolvedValue(new Set<string>());
  mocks.getCompletedLessonSlugs.mockResolvedValue(new Set<string>());
  mocks.getCompletedCourseIds.mockResolvedValue(new Set<string>());
});

async function renderSeriesPage(series = "omni-studio-cert") {
  const { default: R } = await import("react-dom/server");
  const result = await Page({ params: Promise.resolve({ series }) });
  return R.renderToString(result as never);
}

describe("/atlas/[series] under a token-route failure (R2-5 pinned regression)", () => {
  it("still renders the 200 guest syllabus when the token route 429s", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await renderSeriesPage();

    // 200-equivalent: the page rendered instead of throwing NEXT_NOT_FOUND.
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain("OmniStudio Developer Certification");
    // The syllabus is static data, so it survives the outage.
    expect(html).toContain("/atlas/omni-studio-cert/lesson-one");
    expect(html).toContain("Lesson 1: Declarative OmniStudio");
    // …and the page must not claim the live course is gone.
    expect(html).not.toMatch(/not launched|coming soon/i);
  });

  it("never reads the course row when the seam could not resolve a token", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await renderSeriesPage();

    // The degraded path must not issue further DB work for a row it cannot read.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });

  it("keeps the guest view when a session read degrades too", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    // Identity resolves, but the role-scoped completion read degrades.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
      error: null,
    });
    mocks.getCompletedLessonSlugs.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await renderSeriesPage();

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain("/atlas/omni-studio-cert/lesson-one");
  });

  it("does NOT swallow an unrelated loader failure as a graceful empty page", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new Error("missing authentication credentials"),
    );

    await expect(renderSeriesPage()).rejects.toThrow(
      "missing authentication credentials",
    );
  });

  it("still 404s a genuinely non-launched course", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(renderSeriesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  // F-2 (t_c4eafa3b MEDIUM, CWE-200). On `origin/main` this test FAILS: the
  // degraded branch only knew "is this slug in the static catalogue", and the
  // static catalogue carries stealth slugs — so during a mint outage the
  // unpublished syllabus answered 200 and named a course that is not launched.
  it("F-2: 404s a stealth series during a token outage instead of naming it", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(renderSeriesPage("ai-adoption")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    // The fail-closed decision happens before any DB read or render.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});
