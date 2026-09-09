/**
 * page.test.tsx — /learn/[series]/preview (ADR-221).
 *
 * The preview-first-lesson route: renders the read-only lesson-1 preview for a
 * `paywall` user, redirects granted/admin users to the real lesson, and 404s
 * on not-launched / missing series / no published lesson.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const decideCourseAccess = vi.fn();
  const getCourseRowBySlug = vi.fn();
  const getSeriesBySlug = vi.fn();
  const getLessonsForSeries = vi.fn();
  const getLearnMDXContent = vi.fn();
  return {
    mocks: {
      getAccessUserId,
      decideCourseAccess,
      getCourseRowBySlug,
      getSeriesBySlug,
      getLessonsForSeries,
      getLearnMDXContent,
    },
  };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
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
  getAuthorInitials: () => "AC",
}));

vi.mock("@/lib/mdx", () => ({
  linkifySourceCitations: (raw: string) => raw,
}));

vi.mock("@/components/Learn/PreviewFirstLesson", () => ({
  default: ({ lesson, totalLessons }: { lesson: { title: string }; totalLessons: number }) => (
    <div>
      <div data-testid="preview-variant">preview</div>
      <div>{lesson.title}</div>
      <div>lesson 1 of {totalLessons}</div>
      <div>Content locked — subscribe to continue</div>
    </div>
  ),
}));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));

import Page from "./page";

const series = (over: Record<string, unknown> = {}) => ({
  slug: "agentic-ai",
  name: "Agentic AI",
  description: "d",
  gradient: "g",
  totalLessons: 5,
  lessons: [],
  ...over,
});

const lesson = (over: Record<string, unknown> = {}) => ({
  slug: "lesson-1",
  title: "Lesson 1: What an Agent Is",
  series: "agentic-ai",
  lesson: 1,
  excerpt: "ex",
  date: "Aug 1, 2026",
  author: "Adroit Consulting",
  readTime: "5 min",
  tags: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeriesBySlug.mockReset();
  mocks.getLessonsForSeries.mockReset();
  mocks.getLearnMDXContent.mockReset();
  mocks.decideCourseAccess.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.getCourseRowBySlug.mockReset();
});

describe("/learn/[series]/preview (ADR-221)", () => {
  it("renders the preview variant for a paywall user (amber strip + unlock CTA)", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getLessonsForSeries.mockReturnValue([lesson()]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    mocks.getLearnMDXContent.mockReturnValue("---\ntitle: L1\n---\nbody");
    mocks.getCourseRowBySlug.mockResolvedValue({
      id: "c1",
      series_slug: "agentic-ai",
      title: "Agentic AI",
      status: "live",
      access_model: "subscription",
      price_cents: 9900,
      launched_at: null,
      created_at: "",
      updated_at: "",
    });

    const { default: R } = await import("react-dom/server");
    const result = await Page({ params: Promise.resolve({ series: "agentic-ai" }) });
    const html = R.renderToString(result as never);
    expect(html).toContain("preview-variant");
    expect(html).toMatch(/lesson 1 of\s*<!-- -->\s*5/);
    expect(html).toContain("Content locked");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects a granted user to the real lesson (never shows the preview)", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getLessonsForSeries.mockReturnValue([lesson()]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });

    await expect(
      Page({ params: Promise.resolve({ series: "agentic-ai" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/learn/agentic-ai/lesson-1");
  });

  it("redirects an admin-preview user to the real lesson", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getLessonsForSeries.mockReturnValue([lesson()]);
    mocks.getAccessUserId.mockResolvedValue("u-admin");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "admin-preview" });

    await expect(
      Page({ params: Promise.resolve({ series: "agentic-ai" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/learn/agentic-ai/lesson-1");
  });

  it("404s on a not-launched course", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getLessonsForSeries.mockReturnValue([lesson()]);
    mocks.getAccessUserId.mockResolvedValue("u1");
    mocks.decideCourseAccess.mockResolvedValue({ kind: "not-launched" });

    await expect(
      Page({ params: Promise.resolve({ series: "agentic-ai" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s on a missing series", async () => {
    mocks.getSeriesBySlug.mockReturnValue(undefined);
    await expect(
      Page({ params: Promise.resolve({ series: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when a series has no published lesson (nothing to preview)", async () => {
    mocks.getSeriesBySlug.mockReturnValue(series());
    mocks.getLessonsForSeries.mockReturnValue([]);
    await expect(
      Page({ params: Promise.resolve({ series: "agentic-ai" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
