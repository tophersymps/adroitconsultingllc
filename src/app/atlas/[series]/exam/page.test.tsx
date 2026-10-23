/**
 * src/app/atlas/[series]/exam/page.test.tsx — the cert-prep exam route must
 * fail CLOSED on the `unavailable` access decision (SECURITY t_c4eafa3b F-2,
 * CWE-200; fix t_64253bbc).
 *
 * Before the fix an `unavailable` decision skipped both the `not-launched`
 * (404) and `paywall` branches, so an outage rendered a 200 exam page naming a
 * stealth course.
 *
 * Contract now:
 *   unavailable + statically launched -> availability notice, no exam text
 *   unavailable + stealth/unknown     -> 404
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(),
    getCertExam: vi.fn(),
    getKnowledgeCheck: vi.fn(),
    getKnowledgeChecks: vi.fn(),
    decideCourseAccess: vi.fn(),
    getAccessUserId: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    buildPaywallView: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/data/learn", () => ({
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
  scoreQuizAttemptsByQuiz: () => new Map(),
}));

vi.mock("@/lib/seo", () => ({
  buildMetadata: (p: { title: string }) => ({ title: p.title }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/paywall", () => ({ buildPaywallView: mocks.buildPaywallView }));

vi.mock("@/lib/db/server", () => {
  class DbAuthUnavailableError extends Error {
    readonly code = "DB_AUTH_UNAVAILABLE";
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
vi.mock("@/components/Progress/ExamWidget", () => ({
  default: () => <div data-testid="exam-widget">EXAM-QUESTION-TEXT</div>,
}));
vi.mock("@/components/Progress/ExamLocked", () => ({
  default: () => <div data-testid="exam-locked" />,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: ({ tier }: { tier: string }) => <div data-testid="guest-cta">guest-cta-{tier}</div>,
}));
vi.mock("@/components/Catalog/LockedContentPage", () => ({
  LockedContentPage: () => <div data-testid="locked-content">LOCKED</div>,
}));

import Page from "./page";

const SERIES = (over: Record<string, unknown> = {}) => ({
  slug: "omni-studio-cert",
  name: "OmniStudio Developer Certification",
  description: "d",
  gradient: "g",
  totalLessons: 8,
  lessons: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReturnValue(SERIES());
  mocks.getLessonsForSeries.mockReturnValue([{ slug: "l1", title: "Lesson 1: Intro" }]);
  mocks.getCertExam.mockReturnValue({
    quizName: "omni-studio-cert:exam",
    title: "Cert Prep Exam",
    description: "60 questions",
    questions: [{ question: "SECRET-EXAM-QUESTION?", options: ["a", "b"] }],
  });
  mocks.getKnowledgeChecks.mockReturnValue([]);
  mocks.getCourseRowBySlug.mockResolvedValue(null);
  mocks.buildPaywallView.mockReturnValue({});
  mocks.getAccessUserId.mockResolvedValue(null);
});

async function render(series = "omni-studio-cert"): Promise<string> {
  const result = await Page({ params: Promise.resolve({ series }) });
  const { default: R } = await import("react-dom/server");
  return R.renderToString(result as never);
}

describe("/atlas/[series]/exam — `unavailable` must fail CLOSED (F-2)", () => {
  it("a LAUNCHED series under an outage shows an availability notice and no exam text", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });

    const html = await render("omni-studio-cert");

    expect(html).toContain('data-testid="atlas-unavailable"');
    expect(html).not.toContain("SECRET-EXAM-QUESTION");
    expect(html).not.toContain("Certification Prep Exam");
    expect(html).not.toContain('data-testid="exam-widget"');
  });

  it("a STEALTH series under an outage 404s", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "unavailable" });
    mocks.getSeriesBySlug.mockReturnValue(
      SERIES({ slug: "hermes-consultant", name: "Hermes Agent Consultant" }),
    );
    mocks.getCertExam.mockReturnValue({
      quizName: "hermes-consultant:exam",
      title: "Cert Prep Exam",
      description: "x",
      questions: [],
    });

    await expect(render("hermes-consultant")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("not-launched still 404s", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(render("omni-studio-cert")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("a guest on a granted series still gets the CTA, never exam text", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });

    const html = await render("omni-studio-cert");

    expect(html).toMatch(/guest-cta-(<!-- -->)?exam/);
    expect(html).not.toContain("SECRET-EXAM-QUESTION");
  });
});
