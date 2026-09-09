import { describe, it, expect } from "vitest";
import type { BlogPost, LearningSeries, LearnLesson } from "@/data/types";
import { buildSearchIndex } from "@/lib/search";

const post = (slug: string, title: string, over: Partial<BlogPost> = {}): BlogPost => ({
  slug,
  title,
  excerpt: `Excerpt of ${title}`,
  category: "Salesforce",
  categoryColor: "sf",
  categoryGradient: "",
  date: "2026-09-01",
  author: "Adroit Consulting",
  authorInitials: "AC",
  readTime: "5 min read",
  featured: false,
  tags: ["Salesforce"],
  ...over,
});

const series = (slug: string, name: string): LearningSeries => ({
  slug,
  name,
  description: `Description of ${name}`,
  gradient: "from-sky to-blue-600",
  lessons: [],
  totalLessons: 5,
  curriculumLessons: 5,
});

const lesson = (
  slug: string,
  title: string,
  seriesSlug: string,
  over: Partial<LearnLesson> = {},
): LearnLesson => ({
  slug,
  title,
  series: seriesSlug,
  lesson: 1,
  excerpt: `Excerpt of ${title}`,
  date: "2026-09-01",
  author: "Adroit Consulting",
  readTime: "5 min read",
  tags: ["Salesforce"],
  ...over,
});

describe("search — buildSearchIndex", () => {
  const posts = [
    post("react-19", "React 19 Activity", { category: "React & Web Dev", tags: ["React"] }),
    post("salesforce-flow", "Salesforce Flow deep dive"),
  ];
  const seriesList = [series("salesforce-architect", "Salesforce Architect Primer")];
  const lessons = [
    lesson("flow-basics", "Flow basics", "salesforce-architect"),
    lesson("apex-101", "Apex 101", "salesforce-architect", { tags: ["Apex"] }),
  ];
  const search = buildSearchIndex(posts, seriesList, lessons);

  it("returns empty results for empty query", () => {
    expect(search("")).toEqual({ posts: [], series: [], lessons: [], total: 0 });
  });

  it("matches posts by title and groups them under posts", () => {
    const res = search("React 19");
    expect(res.posts).toHaveLength(1);
    expect(res.posts[0]).toMatchObject({ type: "post", href: "/blog/react-19" });
    expect(res.total).toBe(1);
  });

  it("matches series by name", () => {
    const res = search("Architect Primer");
    expect(res.series).toHaveLength(1);
    expect(res.series[0]).toMatchObject({ type: "series", href: "/learn/salesforce-architect" });
  });

  it("matches lessons and links to their series route", () => {
    const res = search("Flow basics");
    expect(res.lessons).toHaveLength(1);
    expect(res.lessons[0]).toMatchObject({
      type: "lesson",
      href: "/learn/salesforce-architect/flow-basics",
    });
  });

  it("is case-insensitive and folds diacritics", () => {
    expect(search("react 19").posts.length).toBe(1);
    expect(search("REACT 19").posts.length).toBe(1);
  });

  it("aggregates totals across groups", () => {
    const res = search("Salesforce");
    expect(res.total).toBe(
      res.posts.length + res.series.length + res.lessons.length,
    );
  });

  it("returns no results for a nonsense query", () => {
    const res = search("zzzz-no-such-thing");
    expect(res.total).toBe(0);
  });
});
