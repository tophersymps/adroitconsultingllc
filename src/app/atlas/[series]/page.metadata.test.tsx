/**
 * page.metadata.test.tsx — disclosure gate on the series page's document head
 * (t_b4c0da5f, MEDIUM, CWE-200).
 *
 * `generateMetadata` runs BEFORE the page's `notFound()` on the DB seam, so a
 * series still in the static launch mirror but delisted in `courses`
 * (pending/archived) used to 404 while its real name/description stayed in the
 * 404 head. The head now follows the two-source rule:
 *
 *   mayDiscloseSeries(slug, dbLive) = mirror AND (dbLive null OR dbLive true)
 *
 * The real `atlas-launch` + `atlas-disclosure` modules run; only the `courses`
 * row lookup (`@/lib/access`) is stubbed, so the assertions cover the predicate
 * itself. The forced-outage case (`null`, t_91a3e30b) must keep the REAL
 * metadata for a launched series — no regression in the fail-closed direction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getCourseRowBySlug: vi.fn() },
}));

vi.mock("@/lib/access", () => ({
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

vi.mock("@/lib/learn", () => ({
  getSeriesBySlug: (slug: string) =>
    slug === "agentic-ai"
      ? {
          slug,
          name: "Agentic AI Engineering",
          description: "Build agentic systems end to end.",
          gradient: "from-a to-b",
          totalLessons: 1,
          lessons: [],
        }
      : slug === "hermes-consultant"
        ? {
            slug,
            name: "Hermes Consultant Track",
            description: "Unpublished stealth syllabus.",
            gradient: "from-a to-b",
            totalLessons: 1,
            lessons: [],
          }
        : null,
  getLessonsForSeries: () => [],
  getSeriesProgress: () => ({ published: 0, total: 0, curriculum: 0 }),
  seriesShortLabel: (s: string) => s,
}));

import { generateMetadata } from "./page";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

const meta = (series: string) =>
  generateMetadata({ params: Promise.resolve({ series }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/atlas/[series] generateMetadata — disclosure gate", () => {
  it("names a launched, DB-live series", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "live" });
    const m = await meta("agentic-ai");
    expect(m.title).toBe("Agentic AI Engineering | Adroit Learn");
    expect(m.description).toBe("Build agentic systems end to end.");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("falls back to the generic noindex head when the series is delisted in the DB", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "pending" });
    const m = await meta("agentic-ai");
    expect(m.title).toBe("Atlas | Adroit Learn");
    expect(m.description).not.toContain("Agentic");
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("keeps the real metadata when the DB is unreadable (forced outage, t_91a3e30b)", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    const m = await meta("agentic-ai");
    expect(m.title).toBe("Agentic AI Engineering | Adroit Learn");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("never names a stealth series, and never even reads the DB for it", async () => {
    const m = await meta("hermes-consultant");
    expect(m.title).toBe("Atlas | Adroit Learn");
    expect(JSON.stringify(m)).not.toContain("Hermes");
    expect(mocks.getCourseRowBySlug).not.toHaveBeenCalled();
  });
});
