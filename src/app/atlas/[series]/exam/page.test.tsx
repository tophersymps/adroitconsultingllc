/**
 * /atlas/[series]/exam — degraded-path existence gate (F-2, t_c4eafa3b).
 *
 * Same contract as the check page: under a token-route failure the LIVE series
 * degrades to the locked-content view at 200 (no exam question text), while a
 * stealth series 404s instead of confirming that an unpublished exam exists.
 *
 * The stealth case fails on `origin/main` (before t_3b6d832e).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(() => []),
    getCertExam: vi.fn(),
    getKnowledgeCheck: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    scoreQuizAttemptsByQuiz: vi.fn(() => ({})),
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
  getCertExam: mocks.getCertExam,
  getKnowledgeCheck: mocks.getKnowledgeCheck,
  getKnowledgeChecks: mocks.getKnowledgeChecks,
  scoreQuizAttemptsByQuiz: mocks.scoreQuizAttemptsByQuiz,
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
vi.mock("@/components/Progress/ExamWidget", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/ExamLocked", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/GuestCTA", () => ({ default: () => <div /> }));

import Page, { generateMetadata } from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const seriesInfo = (
  slug: string,
  name: string,
  examKind: "course-completion" | "certification-prep" = "course-completion",
) => ({
  slug,
  name,
  description: "d",
  gradient: "g",
  totalLessons: 1,
  examKind,
  lessons: [{ slug: "day-01", title: "Day 1" }],
});

async function render(series: string) {
  const { default: R } = await import("react-dom/server");
  const result = await Page({ params: Promise.resolve({ series }) });
  return R.renderToString(result as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessUserId.mockResolvedValue("u1");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getKnowledgeChecks.mockReturnValue([{ n: 1, lessons: [1, 2] }]);
  mocks.getCertExam.mockReturnValue({
    series: "x",
    title: "Certification prep exam",
    questions: [{ question: "SECRET_EXAM_QUESTION_TEXT", correct_answer_index: 1 }],
  });
});

describe("/atlas/[series]/exam degraded existence gate (F-2)", () => {
  it("still degrades a LIVE series to the locked view at 200 — no exam text", async () => {
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
    expect(html).not.toContain("SECRET_EXAM_QUESTION_TEXT");
  });

  it("404s a stealth series when the seam cannot decide", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("ai-adoption", "AI Adoption for Teams"),
    );
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(render("ai-adoption")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});

/**
 * The exam page head (ADR-309, deliverables/learn-ux-exam-naming §B4).
 *
 * The <title>/description used to be `${exam.title}` from exam.json — which for
 * every non-certification course still said "certification", and was the exam
 * document's own heading, not a page title. It is now composed from
 * `examLabels(kind)`, so neither kind can leak the other's wording.
 */
describe("/atlas/[series]/exam — kind-aware SEO head (ADR-309)", () => {
  const meta = (series: string) => generateMetadata({ params: Promise.resolve({ series }) });

  it("a course-completion series titles itself 'Course Completion Exam'", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("ai-at-work", "AI at Work", "course-completion"));
    mocks.getCertExam.mockReturnValue({
      series: "ai-at-work",
      title: "AI at Work: Certification Prep Bootcamp",
      description: "Mirrors the official certification blueprint.",
      questions: [{ question: "q" }],
    });

    const m = (await meta("ai-at-work")) as { title: string; description: string };
    expect(m.title).toBe("AI at Work: Course Completion Exam | Adroit Learn");
    expect(m.description).toBe("Timed course completion exam for AI at Work.");
    // Neither exam.json's title nor its description may reach the head.
    expect(JSON.stringify(m)).not.toMatch(/certification|bootcamp|blueprint/i);
  });

  it("a certification-prep series keeps the certification naming", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("salesforce-data-architect", "Platform Data Architect Certification", "certification-prep"),
    );
    mocks.getCertExam.mockReturnValue({ series: "salesforce-data-architect", title: "x", questions: [{ question: "q" }] });

    const m = (await meta("salesforce-data-architect")) as { title: string; description: string };
    expect(m.title).toBe(
      "Platform Data Architect Certification: Certification Prep Exam | Adroit Learn",
    );
    expect(m.description).toBe(
      "Timed certification prep exam for Platform Data Architect Certification.",
    );
    expect(m.title).not.toMatch(/course completion/i);
  });

  it("returns an empty head when the series has no exam", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("ai-at-work", "AI at Work"));
    mocks.getCertExam.mockReturnValue(null);
    expect(await meta("ai-at-work")).toEqual({});
  });
});
