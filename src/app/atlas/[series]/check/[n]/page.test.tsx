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
