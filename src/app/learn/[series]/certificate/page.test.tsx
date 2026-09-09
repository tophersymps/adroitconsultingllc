/**
 * certificate page — exam-less series completion-record state (backlog B-07 / D2).
 *
 * Per USER DECISION D2, an exam-less series must NOT 404 on its certificate
 * route: it renders an interim "completion record / exam coming soon" state
 * instead of a bare 404 while the prep exam is authored. This test locks that
 * behaviour: for a series with no cert exam, the page renders the Completion
 * Record UI (guest → GuestCTA; authed → lesson-progress record) and never
 * throws NEXT_NOT_FOUND.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSeriesBySlug = vi.fn();
  const getCertExam = vi.fn();
  const getKnowledgeChecks = vi.fn();
  const getKnowledgeCheck = vi.fn();
  const getSeriesLessonSlugs = vi.fn();
  const decideCourseAccess = vi.fn();
  const getAccessUserId = vi.fn();
  const getCourseRowBySlug = vi.fn();
  const getLessonsForSeries = vi.fn();
  const getUser = vi.fn();
  return {
    mocks: {
      getSeriesBySlug,
      getCertExam,
      getKnowledgeChecks,
      getKnowledgeCheck,
      getSeriesLessonSlugs,
      decideCourseAccess,
      getAccessUserId,
      getCourseRowBySlug,
      getLessonsForSeries,
      getUser,
    },
  };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/data/learn", () => ({
  learnSeries: [
    { slug: "agentic-ai" },
    { slug: "omni-studio-cert" },
  ],
}));

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLessonsForSeries: mocks.getLessonsForSeries,
}));

vi.mock("@/lib/quiz", () => ({
  getCertExam: mocks.getCertExam,
  getKnowledgeChecks: mocks.getKnowledgeChecks,
  getKnowledgeCheck: mocks.getKnowledgeCheck,
  scoreQuizAttemptRows: () => null,
}));

vi.mock("@/lib/certificate", () => ({
  getSeriesLessonSlugs: mocks.getSeriesLessonSlugs,
  buildCertificateEligibility: () => ({ eligible: false, lessonsTotal: 0, lessonsCompleted: 0 }),
  certificateCompletionDate: () => null,
  certificateCourseName: (s: string) => s,
  certificateRecipientName: () => "Learner",
  formatCertDate: (d: string) => d,
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/seo", () => ({
  buildMetadata: (p: { title: string; description: string; path: string }) => ({ title: p.title, description: p.description }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: ({ tier, ariaLabel }: { tier: string; ariaLabel: string }) => (
    <div data-testid="guest-cta">
      guest-cta-{tier} · {ariaLabel}
    </div>
  ),
}));

vi.mock("@/lib/sky-server", () => ({
  loadSeriesConstellation: () => null,
  loadAchievementStats: () => Promise.resolve({ streakDays: 0 }),
}));
vi.mock("@/components/Constellations/CertificateCelebration", () => ({
  default: () => <div data-testid="certificate-celebration" />,
}));

import Page from "./page";

const series = (over: Record<string, unknown> = {}) => ({
  slug: "agentic-ai",
  name: "Agentic AI",
  description: "d",
  gradient: "g",
  totalLessons: 8,
  lessons: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReset();
  mocks.getCertExam.mockReset();
  mocks.getSeriesLessonSlugs.mockReset();
  mocks.decideCourseAccess.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.getUser.mockReset();
});

describe("/learn/[series]/certificate — exam-less series (B-07 / D2)", () => {
  it("does NOT 404 on an exam-less series — renders the completion-record state for a guest", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getCertExam.mockReturnValue(null);
    mocks.getSeriesLessonSlugs.mockReturnValue([]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { default: R } = await import("react-dom/server");
    const result = await Page({ params: Promise.resolve({ series: "agentic-ai" }) });
    const html = R.renderToString(result as never);
    // Comment-tolerant: SSR inserts <!-- --> between JSX text nodes.
    expect(html).toContain("Completion Record");
    expect(html).toContain("your progress");
    expect(html).toMatch(/guest-cta-.*certificate/);
    // The route exists (no NEXT_NOT_FOUND thrown).
  });

  it("renders the completion-record lesson progress for an authed user on an exam-less series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getCertExam.mockReturnValue(null);
    mocks.getSeriesLessonSlugs.mockReturnValue(["l1", "l2", "l3"]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
      error: null,
    });

    const { default: R } = await import("react-dom/server");
    const result = await Page({ params: Promise.resolve({ series: "agentic-ai" }) });
    const html = R.renderToString(result as never);
    expect(html).toContain("Completion Record");
    expect(html).toMatch(/All.*3.*lessons completed/);
    expect(html).toMatch(/0.*\/.*3/);
    expect(html).toContain("coming soon");
  });

  it("still renders the real certificate flow for a series WITH a cert exam (not regressed)", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series({ name: "OmniStudio Developer Certification" }));
    mocks.getCertExam.mockReturnValue({ questions: [{ id: "q1" }] });
    mocks.getKnowledgeChecks.mockReturnValue([]);
    mocks.getSeriesLessonSlugs.mockReturnValue(["l1"]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { default: R } = await import("react-dom/server");
    const result = await Page({ params: Promise.resolve({ series: "omni-studio-cert" }) });
    const html = R.renderToString(result as never);
    // Exam series keep the certificate page head (guest CTA), not completion record.
    expect(html).toContain("Your certificate");
    expect(html).toMatch(/guest-cta-.*certificate/);
    expect(html).not.toContain("coming soon");
  });
});
