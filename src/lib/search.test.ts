/**
 * src/lib/search.test.ts — matching over the body-free document index
 * (ADR-220). The matcher is dataset-agnostic now: it receives `SearchDoc[]`
 * from `GET /api/search` instead of importing `@/data/learn` / `@/data/posts`.
 */
import { describe, it, expect } from "vitest";
import type { SearchDoc } from "@/shared/contracts-search";
import { searchDocs } from "@/lib/search";

const postDoc = (
  slug: string,
  title: string,
  over: Partial<SearchDoc> = {},
): SearchDoc => ({
  type: "post",
  title,
  href: `/field-notes/${slug}`,
  group: "Posts",
  snippet: `Excerpt of ${title}`,
  meta: "Salesforce",
  terms: ["Salesforce", slug],
  ...over,
});

const seriesDoc = (slug: string, name: string): SearchDoc => ({
  type: "series",
  title: name,
  href: `/atlas/${slug}`,
  group: "Series",
  snippet: `Description of ${name}`,
  terms: [slug, name],
});

const lessonDoc = (
  slug: string,
  title: string,
  seriesSlug: string,
  terms: string[] = [],
): SearchDoc => ({
  type: "lesson",
  title,
  href: `/atlas/${seriesSlug}/${slug}`,
  group: "Lessons",
  snippet: `Excerpt of ${title}`,
  meta: seriesSlug,
  terms: [seriesSlug, slug, ...terms],
});

describe("search — searchDocs", () => {
  const docs: SearchDoc[] = [
    postDoc("react-19", "React 19 Activity", {
      meta: "React & Web Dev",
      terms: ["React & Web Dev", "React", "react-19"],
    }),
    postDoc("salesforce-flow", "Salesforce Flow deep dive"),
    seriesDoc("salesforce-architect", "Salesforce Architect Primer"),
    lessonDoc("flow-basics", "Flow basics", "salesforce-architect"),
    lessonDoc("apex-101", "Apex 101", "salesforce-architect", ["Apex"]),
  ];

  it("returns empty results for empty query", () => {
    expect(searchDocs(docs, "")).toEqual({
      posts: [],
      series: [],
      lessons: [],
      total: 0,
    });
    expect(searchDocs(docs, "   ").total).toBe(0);
  });

  it("matches posts by title and groups them under posts", () => {
    const res = searchDocs(docs, "React 19");
    expect(res.posts).toHaveLength(1);
    expect(res.posts[0]).toMatchObject({
      type: "post",
      href: "/field-notes/react-19",
      group: "Posts",
    });
    expect(res.total).toBe(1);
  });

  it("matches series by name", () => {
    const res = searchDocs(docs, "Architect Primer");
    expect(res.series).toHaveLength(1);
    expect(res.series[0]).toMatchObject({
      type: "series",
      href: "/atlas/salesforce-architect",
    });
  });

  it("matches lessons and links to their series route", () => {
    const res = searchDocs(docs, "Flow basics");
    expect(res.lessons).toHaveLength(1);
    expect(res.lessons[0]).toMatchObject({
      type: "lesson",
      href: "/atlas/salesforce-architect/flow-basics",
    });
  });

  it("matches on match-only terms (tags / category / slug)", () => {
    const byTag = searchDocs(docs, "Apex");
    expect(byTag.lessons.map((h) => h.href)).toEqual([
      "/atlas/salesforce-architect/apex-101",
    ]);
    const byCategory = searchDocs(docs, "React & Web Dev");
    expect(byCategory.posts).toHaveLength(1);
  });

  it("is case-insensitive and folds diacritics", () => {
    expect(searchDocs(docs, "react 19").posts.length).toBe(1);
    expect(searchDocs(docs, "REACT 19").posts.length).toBe(1);
    expect(
      searchDocs([postDoc("cafe", "Café culture")], "cafe").posts.length,
    ).toBe(1);
  });

  it("aggregates totals across groups", () => {
    const res = searchDocs(docs, "Salesforce");
    expect(res.total).toBe(
      res.posts.length + res.series.length + res.lessons.length,
    );
  });

  it("returns no results for a nonsense query", () => {
    expect(searchDocs(docs, "zzzz-no-such-thing").total).toBe(0);
  });

  it("caps each group (8 posts / 5 series / 10 lessons)", () => {
    const many: SearchDoc[] = [
      ...Array.from({ length: 20 }, (_, i) => postDoc(`p${i}`, `Hit ${i}`)),
      ...Array.from({ length: 20 }, (_, i) =>
        seriesDoc(`s${i}`, `Series Hit ${i}`),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        lessonDoc(`l${i}`, `Lesson Hit ${i}`, "s0"),
      ),
    ];
    const res = searchDocs(many, "Hit");
    expect(res.posts).toHaveLength(8);
    expect(res.series).toHaveLength(5);
    expect(res.lessons).toHaveLength(10);
  });

  it("strips match-only `terms` from the rendered hits", () => {
    const res = searchDocs(docs, "React 19");
    expect(res.posts[0]).not.toHaveProperty("terms");
  });
});
