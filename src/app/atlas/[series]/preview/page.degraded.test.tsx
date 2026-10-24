/**
 * page.degraded.test.tsx — the sixth-call-site regression (t_91a3e30b MEDIUM).
 *
 * Security re-review t_5ebe86d6 measured, behind a 429 stub on the token route:
 *
 *   /atlas/salesforce-architect/preview  -> 500   (live series)
 *   /atlas/ai-adoption/preview           -> 500   (stealth series)
 *   /atlas/no-such-series-xyz/preview    -> 404
 *
 * Two defects behind the same unhandled `DbTokenUnavailableError`:
 *
 *  1. Availability: a token-route outage destroyed a public route that
 *     `PathCard` and `Paywall` both link to.
 *  2. Existence oracle (CWE-200): the preview route was the ONLY
 *     `decideCourseAccess` call site without the F-2 gate, so a 500 vs 404
 *     distinguishable an unpublished series from an unknown slug.
 *
 * Contract pinned here:
 *   - stealth series under an outage -> 404 (fail closed on EXISTENCE);
 *   - live series under an outage    -> 200 preview shell, NO lesson body;
 *   - unrelated loader errors still propagate (classified catch only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAccessUserId: vi.fn(),
    decideCourseAccess: vi.fn(),
    getCourseRowBySlug: vi.fn(),
    getSeriesBySlug: vi.fn(),
    getLessonsForSeries: vi.fn(),
    getLearnMDXContent: vi.fn(),
    notFound: vi.fn(),
    redirect: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
  getAccessUserId: mocks.getAccessUserId,
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: mocks.getSeriesBySlug,
  getLessonsForSeries: mocks.getLessonsForSeries,
  getLearnMDXContent: mocks.getLearnMDXContent,
  stripMDXFrontmatter: (raw: string) => raw,
}));

vi.mock("@/lib/mdx", () => ({
  linkifySourceCitations: (raw: string) => raw,
}));

// The shell is mocked so the assertion is about the DATA the page hands it:
// an empty `mdx` means no lesson body can reach the document.
vi.mock("@/components/Learn/PreviewFirstLesson", () => ({
  default: ({
    lesson,
    mdx,
    view,
  }: {
    lesson: { title: string };
    mdx: string;
    view: { courseName: string };
  }) => (
    <div data-testid="preview-shell">
      <p>{view.courseName}</p>
      <h1>{lesson.title}</h1>
      <div data-testid="lesson-body">{mdx}</div>
    </div>
  ),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

import Page from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const SERIES = {
  "salesforce-architect": {
    slug: "salesforce-architect",
    name: "Salesforce Architect",
    description: "Architect-track series.",
    gradient: "from-a to-b",
    totalLessons: 2,
    lessons: [],
  },
  // STEALTH: in the static catalogue, no live `courses` row.
  "ai-adoption": {
    slug: "ai-adoption",
    name: "AI Adoption for Teams",
    description: "Unpublished stealth syllabus.",
    gradient: "from-a to-b",
    totalLessons: 2,
    lessons: [],
  },
} as Record<string, unknown>;

const LESSONS = [
  {
    slug: "lesson-one",
    title: "Lesson 1: Architecture Foundations",
    series: "salesforce-architect",
    lesson: 1,
    excerpt: "ex",
    date: "Aug 1, 2026",
    author: "Adroit Consulting",
    readTime: "5 min",
    tags: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockImplementation((slug: string) => SERIES[slug] ?? null);
  mocks.getLessonsForSeries.mockReturnValue(LESSONS);
  mocks.getAccessUserId.mockResolvedValue(null);
  mocks.getLearnMDXContent.mockReturnValue(
    "---\ntitle: L1\n---\nSECRET LESSON BODY TEXT",
  );
  mocks.getCourseRowBySlug.mockResolvedValue({
    id: "c1",
    series_slug: "salesforce-architect",
    title: "Salesforce Architect",
    status: "live",
    access_model: "subscription",
    price_cents: 9900,
    launched_at: null,
    created_at: "",
    updated_at: "",
  });
});

async function renderPreview(series = "salesforce-architect") {
  const { default: R } = await import("react-dom/server");
  const result = await Page({ params: Promise.resolve({ series }) });
  return R.renderToString(result as never);
}

describe("/atlas/[series]/preview under a token-route failure (t_91a3e30b)", () => {
  it("F-2: 404s a stealth series during an outage instead of 500ing (existence oracle closed)", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    await expect(renderPreview("ai-adoption")).rejects.toThrow("NEXT_NOT_FOUND");
    // Fail closed BEFORE any content or DB read.
    expect(mocks.getLearnMDXContent).not.toHaveBeenCalled();
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });

  it("still serves a live series as a degraded 200 preview shell (no 500)", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );

    const html = await renderPreview("salesforce-architect");

    // 200-equivalent: rendered instead of throwing NEXT_NOT_FOUND / a 500.
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain("Salesforce Architect");
    expect(html).toContain("Lesson 1: Architecture Foundations");
    // …but the lesson body must NOT be served while the decision is unknown.
    expect(html).not.toContain("SECRET LESSON BODY TEXT");
    expect(mocks.getLearnMDXContent).not.toHaveBeenCalled();
    // No DB work for a course row we cannot read either.
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
    // And a granted/admin redirect must never fire on an unknown decision.
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does NOT swallow an unrelated seam failure", async () => {
    mocks.decideCourseAccess.mockRejectedValue(
      new Error("missing authentication credentials"),
    );

    await expect(renderPreview("salesforce-architect")).rejects.toThrow(
      "missing authentication credentials",
    );
  });

  it("still renders the real lesson-1 excerpt for a healthy paywall decision", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });

    const html = await renderPreview("salesforce-architect");

    expect(html).toContain("SECRET LESSON BODY TEXT");
    expect(mocks.getCourseRowBySlug).toHaveBeenCalled();
  });

  it("still redirects a granted user on a healthy decision", async () => {
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });

    await expect(renderPreview("salesforce-architect")).rejects.toThrow(
      "NEXT_REDIRECT:/atlas/salesforce-architect/lesson-one",
    );
  });
});
