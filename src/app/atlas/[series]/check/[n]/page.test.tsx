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
    getLessonsForSeries: vi.fn((): { slug: string; lesson: number }[] => []),
    getKnowledgeCheck: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getUser: vi.fn(),
    quizRunRows: [] as { score: number }[],
    quizProps: null as Record<string, unknown> | null,
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
  getKnowledgeCheck: mocks.getKnowledgeCheck,
  getKnowledgeChecks: mocks.getKnowledgeChecks,
}));

vi.mock("@/lib/seo", async (importOriginal) => {
  // The REAL `buildMetadata` runs so the disclosure tests below assert the
  // `robots` verdict rather than a stubbed pass-through.
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
    // (`isGuestVisibleCourse`) through `atlas-disclosure`.
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
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    // quiz_run best-score read: .from().select().eq().eq()
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: mocks.quizRunRows, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/components/Catalog/LockedContentPage", () => ({
  LockedContentPage: ({ view }: { view: { seriesSlug: string } }) => (
    <div data-testid="locked" data-series={view.seriesSlug} />
  ),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/Progress/QuizWidget", () => ({
  // Capture the props the page hands the widget (A7): the page owns the
  // continue target, the widget only renders it.
  default: (props: Record<string, unknown>) => {
    mocks.quizProps = props;
    return <div data-testid="quiz" />;
  },
}));
vi.mock("@/components/Progress/GuestCTA", () => ({ default: () => <div /> }));

import Page, { generateMetadata } from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";

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
      seriesInfo("hermes-consultant", "Hermes Consultant Track"),
    );
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
    // Fail-closed before any DB read.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});

/**
 * A7 — "Continue after a pass" (api-contracts.md §B.5).
 *
 * The PAGE owns the routing: it computes the target with `nextLessonAfter` and
 * hands `continueHref`/`continueLabel` to QuizWidget, which renders them as the
 * primary results action only when the run passed. The widget never decides
 * where "continue" goes, so this seam is asserted here.
 */
const lesson = (n: number) => ({
  slug: `lesson-${String(n).padStart(2, "0")}`,
  title: `Lesson ${n}`,
  series: "omni-studio-cert",
  lesson: n,
  excerpt: "e",
  date: "Date unknown",
  author: "Adroit Consulting",
  readTime: "5 min read",
});

/** Read the captured QuizWidget props (avoids TS assignment-narrowing). */
function quizProps(): Record<string, unknown> {
  return (mocks.quizProps ?? {}) as Record<string, unknown>;
}

async function renderAuthed() {
  mocks.getSeriesBySlug.mockReturnValue(
    seriesInfo("omni-studio-cert", "OmniStudio Developer Certification"),
  );
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mocks.quizRunRows = [{ score: 90 }];
  const html = await render("omni-studio-cert");
  return html;
}

describe("/atlas/[series]/check/[n] — continue after a pass (A7)", () => {
  beforeEach(() => {
    mocks.getKnowledgeChecks.mockReturnValue([{ n: 1, lessons: [1, 5] }]);
    mocks.getKnowledgeCheck.mockImplementation((series: string) => ({
      ...checkFor(series),
      lessons: [1, 5],
    }));
    mocks.getLessonsForSeries.mockReturnValue([1, 2, 3, 4, 5, 6].map(lesson));
  });

  it("hands the widget the lesson AFTER the check's range end", async () => {
    mocks.quizProps = null;
    await renderAuthed();

    expect(mocks.quizProps).not.toBeNull();
    // Range ends at lesson 5 → the next lesson is 6 (never the range end).
    expect(quizProps().continueHref).toBe("/atlas/omni-studio-cert/lesson-06");
    expect(quizProps().continueLabel).toBe("Continue to Lesson 6");
    // The page still owns the pass rule + the audit-friendly verdict row.
    expect(quizProps().passThreshold).toBe(80);
  });

  it("passes no continue target when the check ends at the series tail", async () => {
    mocks.quizProps = null;
    // Same route (check 1) but its range now ends at the last published lesson.
    mocks.getKnowledgeChecks.mockReturnValue([{ n: 1, lessons: [4, 6] }]);
    mocks.getKnowledgeCheck.mockImplementation((series: string) => ({
      ...checkFor(series),
      lessons: [4, 6],
    }));

    await renderAuthed();

    expect(quizProps().continueHref).toBeUndefined();
    expect(quizProps().continueLabel).toBeUndefined();
  });
});

/**
 * Disclosure head (t_df70d017 / ADR-001).
 *
 * The check head used to answer its `noindex` question from the hand-maintained
 * `PUBLICLY_LAUNCHED_SERIES` mirror, so a course launched from `/admin` stayed
 * uncrawlable until a human edited the mirror. It now uses the same DB
 * disclosure seam as `/atlas/[series]`, failing closed to the mirror only on a
 * credential outage. Metadata runs BEFORE the page's `notFound()`, so this head
 * is also the t_91a3e30b CWE-200 guard: a stealth series must not name itself.
 */
describe("/atlas/[series]/check/[n] — disclosure head follows the DB seam (t_df70d017)", () => {
  const meta = (series: string, n = "1") =>
    generateMetadata({ params: Promise.resolve({ series, n }) });

  it("indexes a DB-live series that is ABSENT from the static mirror", async () => {
    // The `sf-agentforce-specialist` defect class: live in the DB, never added
    // to the mirror, so its head stayed `noindex` until a human mirror PR.
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("new-course", "Brand New Course"));
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "sub-or-one-time",
    });

    const m = (await meta("new-course")) as { title: string; robots: unknown };

    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.title).toBe("SECRET_CHECK_TITLE | Adroit Learn");
    // Proof the real head did not come from the mirror.
    expect(isPubliclyLaunchedSeries("new-course")).toBe(false);
  });

  it("never names a stealth (live + granted) series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("hermes-consultant", "Hermes Consultant Track"),
    );
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "granted",
    });

    const m = (await meta("hermes-consultant")) as { title: string; robots: unknown };

    expect(m.title).toBe("Knowledge Check | Adroit Learn");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toContain("SECRET_CHECK_TITLE");
  });

  it("gives a series with no courses row the generic noindex head", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("ghost-series", "Ghost Series"));
    mocks.getCourseRowBySlug.mockResolvedValue(null);

    const m = (await meta("ghost-series")) as { title: string; robots: unknown };

    expect(m.title).toBe("Knowledge Check | Adroit Learn");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toContain("SECRET_CHECK_TITLE");
  });

  it("falls back to the static mirror on a credential outage — both directions", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      seriesInfo("omni-studio-cert", "OmniStudio Developer Certification"),
    );
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const launched = (await meta("omni-studio-cert")) as { title: string; robots: unknown };
    expect(launched.title).toBe("SECRET_CHECK_TITLE | Adroit Learn");
    expect(launched.robots).toEqual({ index: true, follow: true });

    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("new-course", "Brand New Course"));

    const offline = (await meta("new-course")) as { title: string; robots: unknown };
    expect(offline.title).toBe("Knowledge Check | Adroit Learn");
    expect(offline.robots).toEqual({ index: false, follow: false });
  });

  it("returns an empty head when the check does not exist", async () => {
    mocks.getSeriesBySlug.mockReturnValue(seriesInfo("omni-studio-cert", "OmniStudio"));
    mocks.getKnowledgeCheck.mockReturnValue(null);
    expect(await meta("omni-studio-cert", "9")).toEqual({});
  });
});
