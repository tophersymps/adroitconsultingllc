/**
 * page.metadata.test.tsx — disclosure gate on the lesson page's document head
 * (t_b4c0da5f, MEDIUM, CWE-200).
 *
 * Same defect as the series route: metadata is generated before the DB seam's
 * `notFound()`, so a mirror-listed series delisted in `courses` kept its lesson
 * title/excerpt in the 404 head. Two-source rule now: mirror AND (DB unreadable
 * OR DB live). The real predicate modules run; only the `courses` row lookup is
 * stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getCourseRowBySlug: vi.fn() },
}));

vi.mock("@/lib/access", () => ({
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/learn", () => ({
  getLesson: (series: string, slug: string) =>
    slug === "day-01" &&
    (series === "agentic-ai" || series === "hermes-consultant")
      ? {
          slug,
          series,
          title: "Day 1 — Build the loop",
          lesson: 1,
          excerpt: "Ship a working agent today.",
          date: "2026-10-01",
          author: "Adroit",
          tags: ["agents"],
        }
      : null,
  getSeriesBySlug: (slug: string) =>
    slug === "agentic-ai"
      ? {
          slug,
          name: "Agentic AI Engineering",
          description: "d",
          gradient: "",
          totalLessons: 1,
          lessons: [],
        }
      : slug === "hermes-consultant"
        ? {
            slug,
            name: "Hermes Consultant Track",
            description: "stealth",
            gradient: "",
            totalLessons: 1,
            lessons: [],
          }
        : null,
  getLessonsForSeries: () => [],
  getLearnMDXContent: () => "",
  stripMDXFrontmatter: (r: string) => r,
  stripLessonTitleH1: (r: string) => r,
  toIsoDate: (d: string) => d,
  getAuthorInitials: () => "AD",
}));

import { generateMetadata } from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const meta = (series: string, slug = "day-01") =>
  generateMetadata({ params: Promise.resolve({ series, slug }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/atlas/[series]/[slug] generateMetadata — disclosure gate", () => {
  it("names a launched, DB-live lesson", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "live" });
    const m = await meta("agentic-ai");
    expect(m.title).toBe(
      "Day 1 — Build the loop | Agentic AI Engineering | Adroit",
    );
    expect(m.description).toBe("Ship a working agent today.");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("falls back to the generic noindex head when the series is delisted in the DB", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "archived" });
    const m = await meta("agentic-ai");
    expect(m.title).toBe("Atlas | Adroit Learn");
    expect(JSON.stringify(m)).not.toContain("Build the loop");
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("keeps the real metadata when the DB is unreadable (forced outage, t_91a3e30b)", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    const m = await meta("agentic-ai");
    expect(m.title).toContain("Build the loop");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("never names a stealth series' lesson, and never reads the DB for it", async () => {
    const m = await meta("hermes-consultant");
    expect(m.title).toBe("Atlas | Adroit Learn");
    expect(JSON.stringify(m)).not.toContain("Build the loop");
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});
