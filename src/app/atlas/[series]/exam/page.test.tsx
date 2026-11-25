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
  // `hermes-consultant` is the STEALTH control: in the static catalogue, never
  // in the launch snapshot (the 7 `/admin`-launched courses are disclosed now).
  learnSeries: [{ slug: "omni-studio-cert" }, { slug: "hermes-consultant" }],
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

vi.mock("@/lib/seo", async (importOriginal) => {
  // The REAL `buildMetadata` runs: the disclosure tests below assert the
  // `robots` verdict, and a hand-rolled stub could paper over a wrong flag.
  const actual = await importOriginal<typeof import("@/lib/seo")>();
  return { ...actual };
});

vi.mock("@/lib/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access")>();
  return {
    accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
    getAccessUserId: mocks.getAccessUserId,
    getCourseRowBySlug: mocks.getCourseRowBySlug,
    // t_df70d017: the disclosure predicate consumes the REAL stealth rule
    // (`isGuestVisibleCourse`) through `atlas-disclosure`, so the mock must
    // supply it.
    isGuestVisibleCourse: actual.isGuestVisibleCourse,
  };
});

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
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";

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
      seriesInfo("hermes-consultant", "Hermes Consultant Track"),
    );
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
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

  beforeEach(() => {
    // t_df70d017: the head now asks the DB seam, so the series under test must
    // resolve as a live, non-stealth row for the real head to be emitted.
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "sub-or-one-time",
    });
  });

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
      seriesInfo("salesforce-architect", "Platform Data Architect Certification", "certification-prep"),
    );
    mocks.getCertExam.mockReturnValue({ series: "salesforce-architect", title: "x", questions: [{ question: "q" }] });

    const m = (await meta("salesforce-architect")) as { title: string; description: string };
    expect(m.title).toBe(
      "Platform Data Architect Certification: Certification Prep Exam | Adroit Learn",
    );
    expect(m.description).toBe(
      "Timed certification prep exam for Platform Data Architect Certification.",
    );
    expect(m.title).not.toMatch(/course completion/i);
  });

  it("does not disclose an unlaunched series in the head", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("hermes-consultant-intermediate", "Unlaunched Stealth Certification", "certification-prep"),
    );
    mocks.getCertExam.mockReturnValue({ series: "hermes-consultant-intermediate", title: "x", questions: [{ question: "q" }] });
    // No `courses` row → the DB seam says "do not disclose".
    mocks.getCourseRowBySlug.mockResolvedValue(null);

    const m = (await meta("hermes-consultant-intermediate")) as { title: string; description: string };
    expect(m.title).toBe("Exam | Adroit Learn");
    expect(JSON.stringify(m)).not.toMatch(/Unlaunched Stealth/i);
  });

  it("returns an empty head when the series has no exam", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("ai-at-work", "AI at Work"));
    mocks.getCertExam.mockReturnValue(null);
    expect(await meta("ai-at-work")).toEqual({});
  });
});

/**
 * Disclosure head (t_df70d017 / ADR-001).
 *
 * The exam head used to answer its `noindex` question from the hand-maintained
 * `PUBLICLY_LAUNCHED_SERIES` mirror, so a course launched from `/admin` stayed
 * uncrawlable until a human PR edited the mirror (the `sf-agentforce-specialist`
 * defect of 2026-11-25). It now uses the same disclosure authority as
 * `/atlas/[series]`: `mayDiscloseSeriesLive` (the DB seam, failing closed to the
 * mirror only on a credential outage).
 */
describe("/atlas/[series]/exam — disclosure head follows the DB seam (t_df70d017)", () => {
  const meta = (series: string) =>
    generateMetadata({ params: Promise.resolve({ series }) });

  const headFor = (series: string) => seriesInfo(series, "Brand New Course");

  it("gives a DB-live series ABSENT from the static mirror a real indexable head", async () => {
    // The regression case for the defect. `new-course` is synthetic: it is not
    // in the static launch mirror (asserted below) and not in the static
    // catalogue either — only the DB seam knows it.
    mocks.getSeriesBySlug.mockReturnValue(headFor("new-course"));
    mocks.getCertExam.mockReturnValue({
      series: "new-course",
      title: "x",
      questions: [{ question: "q" }],
    });
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "sub-or-one-time",
    });

    const m = (await meta("new-course")) as { title: string; robots: unknown };

    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.title).toBe("Brand New Course: Course Completion Exam | Adroit Learn");
    // Proof the head did NOT come from the mirror: the mirror has never heard
    // of this slug, so before this change the head was the generic noindex one.
    expect(isPubliclyLaunchedSeries("new-course")).toBe(false);
  });

  it("never names a stealth (live + granted) series: the DB verdict hides it", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("hermes-consultant", "Hermes Consultant Track"),
    );
    mocks.getCertExam.mockReturnValue({ series: "hermes-consultant", title: "x", questions: [{ question: "q" }] });
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "granted",
    });

    const m = (await meta("hermes-consultant")) as { title: string; robots: unknown };

    expect(m.title).toBe("Exam | Adroit Learn");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toContain("Hermes");
  });

  it("gives a series with no courses row at all the generic noindex head", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("ghost-series", "Ghost Series"));
    mocks.getCertExam.mockReturnValue({ series: "ghost-series", title: "x", questions: [{ question: "q" }] });
    mocks.getCourseRowBySlug.mockResolvedValue(null);

    const m = (await meta("ghost-series")) as { title: string; robots: unknown };

    expect(m.title).toBe("Exam | Adroit Learn");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toContain("Ghost");
  });

  it("falls back to the static mirror on a credential outage — both directions", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("omni-studio-cert", "OmniStudio Developer Certification", "certification-prep"),
    );
    mocks.getCertExam.mockReturnValue({ series: "omni-studio-cert", title: "x", questions: [{ question: "q" }] });
    // `omni-studio-cert` IS in the mirror → the launched series keeps its head.
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const launched = (await meta("omni-studio-cert")) as { title: string; robots: unknown };
    expect(launched.title).toBe(
      "OmniStudio Developer Certification: Certification Prep Exam | Adroit Learn",
    );
    expect(launched.robots).toEqual({ index: true, follow: true });

    // A series absent from the mirror fails closed to the generic head.
    mocks.getSeriesBySlug.mockReturnValue(headFor("new-course"));
    mocks.getCertExam.mockReturnValue({ series: "new-course", title: "x", questions: [{ question: "q" }] });

    const offline = (await meta("new-course")) as { title: string; robots: unknown };
    expect(offline.title).toBe("Exam | Adroit Learn");
    expect(offline.robots).toEqual({ index: false, follow: false });
  });
});
