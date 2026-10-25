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

vi.mock("@/lib/db/server", () => ({
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

import Page, { generateMetadata } from "./page";
import { DEGRADED_PAYWALL_MESSAGE } from "@/components/Catalog/Paywall";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const series = (over: Record<string, unknown> = {}) => ({
  slug: "agentic-ai",
  name: "Agentic AI",
  description: "d",
  gradient: "g",
  totalLessons: 8,
  lessons: [],
  // Every series carries an examKind (B1 made it required in series.json).
  examKind: "certification-prep",
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

describe("/atlas/[series]/certificate — exam-less series (B-07 / D2)", () => {
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

  // F-2 (t_c4eafa3b MEDIUM, CWE-200). Fails on `origin/main`: under a mint
  // outage the stealth series' certificate route answered 200 and named the
  // unpublished course in the locked-content view.
  it("F-2: 404s a stealth series' certificate route during a token outage", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series({ slug: "ai-adoption", name: "AI Adoption for Teams" }));
    mocks.getCertExam.mockReturnValue(null);
    mocks.getSeriesLessonSlugs.mockReturnValue([]);
    mocks.getAccessUserId.mockResolvedValue(null);
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(
      Page({ params: Promise.resolve({ series: "ai-adoption" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("/atlas/[series]/certificate — degraded paywall announces itself (A11Y-M1, t_8d1638a7)", () => {
  const renderCert = async () => {
    const { default: R } = await import("react-dom/server");
    const result = await Page({ params: Promise.resolve({ series: "agentic-ai" }) });
    return R.renderToString(result as never);
  };

  it("renders a polite role=status region with the degraded copy when the token path fails", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getCertExam.mockReturnValue(null);
    mocks.getLessonsForSeries.mockReturnValue([{ slug: "l1", title: "L1", number: 1 }]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await renderCert();

    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toContain(DEGRADED_PAYWALL_MESSAGE);
    // The paywall/lock UI stays — the status is additive, not a replacement.
    expect(html).toContain("Members-only content");
    // No internals in user-facing copy.
    expect(html).not.toMatch(/token\/anonymous|DbTokenUnavailableError|429/);
    // Exactly one main landmark.
    expect(html.match(/<main id="main"/g) ?? []).toHaveLength(1);
    // Never read the row it cannot read, never 404 a live course.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });

  it("renders NO status region on an ordinary locked (non-degraded) paywall", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getCertExam.mockReturnValue(null);
    mocks.getLessonsForSeries.mockReturnValue([{ slug: "l1", title: "L1", number: 1 }]);
    mocks.getAccessUserId.mockResolvedValue(null);
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    mocks.getCourseRowBySlug.mockResolvedValue({
      slug: "agentic-ai",
      access_model: "subscription",
      price_cents: 4900,
    });

    const html = await renderCert();

    expect(html).toContain("Members-only content");
    expect(html).not.toMatch(/role="status"/);
    expect(html).not.toContain(DEGRADED_PAYWALL_MESSAGE);
  });
});

/**
 * SEO head is KIND-AWARE (deliverables/learn-ux-exam-naming §B4, ADR-309).
 *
 * generateMetadata used to spell out "cert prep exam" in the certificate
 * description for every series — including the eight course-completion ones.
 * The description is now composed from `examLabels(s.examKind)`, so each kind
 * may only name its own exam, in both the certificate and the completion-record
 * (exam-not-authored) states.
 */
describe("/atlas/[series]/certificate — SEO head is kind-aware (B4)", () => {
  const meta = (slug: string) =>
    generateMetadata({ params: Promise.resolve({ series: slug }) });

  it("uses the course-completion labels for a course-completion series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      series({ slug: "agentic-ai", name: "Agentic AI", examKind: "course-completion" }),
    );
    mocks.getCertExam.mockReturnValue({ questions: [{ id: "q1" }] });

    const m = await meta("agentic-ai");

    expect(m.title).toBe("Certificate of Completion | Agentic AI | Adroit Learn");
    expect(m.description).toBe(
      "Printable certificate of completion for the Agentic AI course: all lessons completed and the course completion exam passed at 72% or higher.",
    );
    // The old blanket phrase must not leak into a non-certification course.
    expect(m.description).not.toMatch(/cert prep|certification prep/i);
  });

  it("uses the certification-prep labels for a certification-prep series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      series({
        slug: "omni-studio-cert",
        name: "OmniStudio Developer Certification",
        examKind: "certification-prep",
      }),
    );
    mocks.getCertExam.mockReturnValue({ questions: [{ id: "q1" }] });

    const m = await meta("omni-studio-cert");

    expect(m.title).toBe(
      "Certificate of Completion | OmniStudio Developer Certification | Adroit Learn",
    );
    expect(m.description).toContain("cert prep exam passed at 72% or higher");
    expect(m.description).not.toMatch(/course completion exam/i);
  });

  it("uses the series' kind in the completion-record description when no exam is authored", async () => {
    mocks.getSeriesBySlug.mockReturnValue(
      series({ slug: "agentic-ai", name: "Agentic AI", examKind: "course-completion" }),
    );
    mocks.getCertExam.mockReturnValue(null);

    const m = await meta("agentic-ai");

    expect(m.title).toBe("Completion Record | Agentic AI | Adroit Learn");
    expect(m.description).toContain(
      "The course completion exam for this path is being authored",
    );
    expect(m.description).not.toMatch(/cert prep|certification prep/i);
  });

  it("returns an empty head for an unknown series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(undefined);
    expect(await meta("no-such-series")).toEqual({});
  });
});
