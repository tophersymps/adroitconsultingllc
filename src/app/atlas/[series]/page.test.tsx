/**
 * src/app/atlas/[series]/page.test.tsx — credential-bridge degrade regression
 * (t_223f8b3d, digest 307487673 / React error #441).
 *
 * The failure this locks: `GET /atlas/<series>` called
 * `getSupabaseServerClient()`, and when Neon Auth refused to mint BOTH the
 * session and the anonymous Data API JWT the factory returned a client with no
 * `Authorization` header. The first read then got
 * `missing authentication credentials` from the Data API, the throw escaped the
 * RSC render and the page became a 500.
 *
 * The contract now:
 *   access decision `unavailable`  -> page renders the syllabus, guest state, 200
 *   no Data API client at all      -> the render never touches the factory
 *   `not-launched`                 -> still 404 (the gate is not neutered)
 *
 * Discrimination: on 992f61c7 this file fails — the old page awaited
 * `getSupabaseServerClient()` (mocked here to reject) and threw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(),
    getSeriesProgress: vi.fn(),
    seriesShortLabel: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getCatalogForUserV2: vi.fn(),
    prerequisitesMet: vi.fn(),
    getCompletedCourseIds: vi.fn(),
    getCompletedLessonSlugs: vi.fn(),
    loadSeriesConstellation: vi.fn(),
    loadExamPassedBySeries: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    getSupabaseServerClient: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/data/learn", () => ({ learnSeries: [{ slug: "omni-studio-cert" }] }));

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLessonsForSeries: mocks.getLessonsForSeries,
  getSeriesProgress: mocks.getSeriesProgress,
  seriesShortLabel: mocks.seriesShortLabel,
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

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: mocks.getCatalogForUserV2,
  prerequisitesMet: mocks.prerequisitesMet,
}));

vi.mock("@/lib/completion", () => ({
  getCompletedCourseIds: mocks.getCompletedCourseIds,
  getCompletedLessonSlugs: mocks.getCompletedLessonSlugs,
}));

vi.mock("@/lib/sky-server", () => ({
  loadSeriesConstellation: mocks.loadSeriesConstellation,
  loadExamPassedBySeries: mocks.loadExamPassedBySeries,
}));

vi.mock("@/lib/quiz", () => ({ getKnowledgeChecks: mocks.getKnowledgeChecks }));

// The credential bridge is DOWN for this whole file: any page that still builds
// a Data API client just to learn who is reading will throw here.
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
    getSupabaseServerClient: mocks.getSupabaseServerClient,
  };
});

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/Learn/SeriesSyllabus", () => ({
  default: ({ lessons }: { lessons: unknown[] }) => (
    <div data-testid="syllabus">syllabus:{lessons.length}</div>
  ),
}));
vi.mock("@/components/Learn/LessonProgress", () => ({
  default: () => <div data-testid="lesson-progress" />,
}));
vi.mock("@/components/Learn/EmptyState", () => ({
  default: () => <div data-testid="empty-state" />,
}));
vi.mock("@/components/Learn/PrerequisitesSection", () => ({
  default: () => <div data-testid="prereqs" />,
}));
vi.mock("@/components/Progress/SeriesProgress", () => ({
  default: () => <div data-testid="series-progress" />,
}));
vi.mock("@/components/Progress/QuizStats", () => ({
  default: () => <div data-testid="quiz-stats" />,
}));
vi.mock("@/components/Progress/CertReadiness", () => ({
  default: () => <div data-testid="cert-readiness" />,
}));
vi.mock("@/components/Progress/CheckCardList", () => ({
  default: () => <div data-testid="check-list" />,
}));
vi.mock("@/components/Progress/ExamCard", () => ({
  default: () => <div data-testid="exam-card" />,
}));
vi.mock("@/components/Catalog/StatusBadge", () => ({
  StatusBadge: () => <span data-testid="status-badge" />,
}));
vi.mock("@/components/Catalog/AccessModelChip", () => ({
  AccessModelChip: () => <span data-testid="access-chip" />,
}));
vi.mock("@/components/Learn/DifficultyPill", () => ({
  default: () => <span data-testid="difficulty" />,
}));
vi.mock("@/components/Constellations/chart/SeriesStarChart", () => ({
  default: () => <div data-testid="star-chart" />,
}));

import Page from "./page";

const SERIES = {
  slug: "omni-studio-cert",
  name: "OmniStudio Developer Certification",
  description: "A certification path.",
  gradient: "from-a to-b",
  totalLessons: 8,
  lessons: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReturnValue(SERIES);
  mocks.getLessonsForSeries.mockReturnValue([
    { slug: "l1", title: "Lesson 1: Intro", excerpt: "x" },
  ]);
  mocks.getSeriesProgress.mockReturnValue({
    published: 1,
    total: 1,
    curriculum: 2,
  });
  mocks.seriesShortLabel.mockReturnValue("OSC");
  mocks.getCourseRowBySlug.mockResolvedValue(null);
  mocks.getCatalogForUserV2.mockResolvedValue({ courses: [] });
  mocks.prerequisitesMet.mockReturnValue(false);
  mocks.getCompletedCourseIds.mockResolvedValue(new Set());
  mocks.getCompletedLessonSlugs.mockResolvedValue(new Set());
  mocks.loadSeriesConstellation.mockResolvedValue(null);
  mocks.loadExamPassedBySeries.mockResolvedValue(new Set());
  mocks.getKnowledgeChecks.mockReturnValue([]);
  mocks.getSupabaseServerClient.mockRejectedValue(
    Object.assign(new Error("Neon Auth did not mint a Data API JWT"), {
      name: "DbAuthUnavailableError",
      code: "DB_AUTH_UNAVAILABLE",
    }),
  );
});

async function render(): Promise<string> {
  const result = await Page({
    params: Promise.resolve({ series: "omni-studio-cert" }),
  });
  const { default: R } = await import("react-dom/server");
  return R.renderToString(result as never);
}

describe("/atlas/[series] under a credential-bridge outage (t_223f8b3d)", () => {
  it("renders the syllabus (HTTP 200) instead of throwing when the seam reports `unavailable`", async () => {
    mocks.getAccessUserId.mockResolvedValue(null);
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    const html = await render();

    // The route exists: no NEXT_NOT_FOUND, no escaped throw.
    expect(html).toContain('data-testid="syllabus"');
    expect(html).toContain("temporarily unavailable");
    expect(html).toContain("data-degraded");
  });

  it("renders the same way for a SIGNED-IN reader whose JWT could not be minted", async () => {
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    const html = await render();

    expect(html).toContain('data-testid="syllabus"');
    // Degraded ⇒ guest state: no per-user completion read is claimed.
    expect(mocks.getCompletedLessonSlugs).not.toHaveBeenCalled();
    expect(mocks.loadExamPassedBySeries).not.toHaveBeenCalled();
  });

  it("never builds a Data API client just to learn who is reading", async () => {
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    await render();

    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("still 404s a not-launched course (the access gate is not neutered)", async () => {
    mocks.getAccessUserId.mockResolvedValue(null);
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("healthy signed-in render keeps per-user progress and shows no degraded notice", async () => {
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
    mocks.getCompletedLessonSlugs.mockResolvedValue(new Set(["l1"]));

    const html = await render();

    expect(html).toContain('data-testid="syllabus"');
    expect(html).not.toContain("temporarily unavailable");
    expect(mocks.getCompletedLessonSlugs).toHaveBeenCalledWith("u1");
  });
});
