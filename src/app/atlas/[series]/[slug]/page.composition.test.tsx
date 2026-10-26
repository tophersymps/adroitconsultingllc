/**
 * page.composition.test.tsx — A2: the lesson page's content order.
 *
 * Contract (K3 §1, A2 acceptance): `/atlas/[series]/[slug]` renders
 *
 *   body → practice questions → SOURCES → Prev/Next navigation
 *
 * and the Sources block is the LAST content block on the page, rendered
 * exactly once. The body render must receive `sources="split"` so `remark-gfm`'s
 * footnotes section is dropped from the body; otherwise the citation list would
 * appear twice (once inside the body, once as the appendix).
 *
 * The two MDX components are stubbed here because they are async React server
 * components (`renderToString` cannot await them). The stubs still prove the
 * page-level contract — the split flag, the gate, the count and the position —
 * while the real compile pipeline is exercised in
 * `footnote-plugins.test.ts` / `MDXSources.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  articleProps: [] as { mdx: string; sources?: "inline" | "split" }[],
  sourcesProps: [] as { mdx: string }[],
  mdxContent: { value: "" as string },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/MDX/MDXArticle", () => ({
  default: (props: { mdx: string; sources?: "inline" | "split" }) => {
    mocks.articleProps.push(props);
    return <div data-testid="mdx-body" />;
  },
}));

vi.mock("@/components/MDX/MDXSources", () => ({
  default: (props: { mdx: string }) => {
    mocks.sourcesProps.push(props);
    return (
      <section data-testid="mdx-sources" data-footnotes className="lesson-sources">
        <h2>Sources</h2>
      </section>
    );
  },
}));

vi.mock("@/lib/learn", () => ({
  getLesson: (series: string, slug: string) =>
    series === "omni-studio-cert" && slug === "day-01"
      ? {
          slug,
          series,
          title: "Day 1 — OmniStudio solutions",
          lesson: 1,
          excerpt: "Remove friction from the flow.",
          date: "2026-10-01",
          author: "Adroit",
          tags: ["omnistudio"],
          readTime: "6 min read",
        }
      : null,
  getSeriesBySlug: (slug: string) =>
    slug === "omni-studio-cert"
      ? {
          slug,
          name: "OmniStudio Developer Certification",
          description: "Build declarative OmniStudio solutions.",
          gradient: "from-a to-b",
          totalLessons: 1,
          lessons: [{ slug: "day-01", title: "Day 1 — OmniStudio solutions" }],
        }
      : null,
  getLessonsForSeries: () => [
    { slug: "day-01", title: "Day 1 — OmniStudio solutions", number: 1 },
  ],
  getLearnMDXContent: () => mocks.mdxContent.value,
  stripMDXFrontmatter: (raw: string) => raw,
  stripLessonTitleH1: (raw: string) => raw,
  toIsoDate: (d: string) => d,
  getAuthorInitials: () => "AD",
}));

vi.mock("@/lib/mdx", () => ({ linkifySourceCitations: (raw: string) => raw }));
vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://example.test" },
  buildMetadata: (p: unknown) => p,
}));
vi.mock("@/lib/quiz", () => ({ getQuizForLesson: () => null, getKnowledgeChecks: () => [] }));
vi.mock("@/lib/sky-server", () => ({ loadSeriesConstellation: () => null }));
vi.mock("@/data/lesson-audio", () => ({ lessonAudio: [] }));

// Guest (unauthenticated) rendering: no quiz payload, no celebration, the
// practice section is the GuestCTA placeholder.
vi.mock("@/lib/access", () => ({
  getAccessUserId: async () => null,
  accessSeam: { decideCourseAccess: async () => ({ kind: "granted" }) },
  getCourseRowBySlug: async () => null,
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/BlogPost/ReadingProgress", () => ({ default: () => <div /> }));
vi.mock("@/components/BlogPost/ShareBar", () => ({ default: () => <div /> }));
vi.mock("@/components/Learn/LessonNavigation", () => ({
  default: () => <nav data-testid="lesson-nav" />,
}));
vi.mock("@/components/Progress/MarkComplete", () => ({ default: () => <div /> }));
vi.mock("@/components/Progress/LessonCompleteProgress", () => ({
  default: () => <div />,
}));
vi.mock("@/components/Progress/LessonQuiz", () => ({
  default: () => <div data-testid="lesson-quiz" />,
}));
vi.mock("@/components/Progress/GuestCTA", () => ({
  default: () => <div data-testid="guest-cta" />,
}));
vi.mock("@/components/BlogPost/AudioPlayerLazy", () => ({
  AudioPlayerLazy: () => <div />,
}));
vi.mock("@/components/Constellations/LessonCelebration", () => ({
  default: () => <div />,
}));
vi.mock("@/components/Catalog/Paywall", () => ({ default: () => <div /> }));

import LessonPage from "./page";

const DOC_WITH_SOURCES = [
  "Intro paragraph with a citation[^1].",
  "",
  "[^1]: First source — https://example.com/first",
].join("\n");

const DOC_WITHOUT_SOURCES = "Intro paragraph with no citations.";

async function renderLesson(): Promise<string> {
  const { default: R } = await import("react-dom/server");
  const result = await LessonPage({
    params: Promise.resolve({ series: "omni-studio-cert", slug: "day-01" }),
  });
  return R.renderToString(result as never);
}

function order(html: string, ...markers: string[]): number[] {
  return markers.map((marker) => {
    const index = html.indexOf(marker);
    expect(index, `missing marker: ${marker}`).toBeGreaterThan(-1);
    return index;
  });
}

beforeEach(() => {
  mocks.articleProps.length = 0;
  mocks.sourcesProps.length = 0;
  mocks.mdxContent.value = DOC_WITH_SOURCES;
});

describe("/atlas/[series]/[slug] composition — citations last (A2)", () => {
  it("renders body → practice → Sources → nav, Sources last", async () => {
    const html = await renderLesson();

    // DOM order in the serialised page.
    const [body, practice, sources, nav] = order(
      html,
      'data-testid="mdx-body"',
      'data-testid="guest-cta"',
      'data-testid="mdx-sources"',
      'data-testid="lesson-nav"',
    );
    expect(body).toBeLessThan(practice);
    expect(practice).toBeLessThan(sources);
    expect(sources).toBeLessThan(nav);
  });

  it("gives the body render sources=\"split\" so the section is not duplicated", async () => {
    await renderLesson();
    expect(mocks.articleProps).toHaveLength(1);
    expect(mocks.articleProps[0].sources).toBe("split");
  });

  it("renders the Sources block exactly once", async () => {
    const html = await renderLesson();
    expect(mocks.sourcesProps).toHaveLength(1);
    expect(mocks.sourcesProps[0].mdx).toContain("https://example.com/first");
    const sections = (html.match(/data-testid="mdx-sources"/g) ?? []).length;
    expect(sections).toBe(1);
  });

  it("keeps Sources inside article.article-body (the reading column)", async () => {
    const html = await renderLesson();
    const articleStart = html.indexOf('<article class="article-body');
    const articleEnd = html.indexOf("</article>", articleStart);
    expect(articleStart).toBeGreaterThan(-1);
    const article = html.slice(articleStart, articleEnd);
    expect(article).toContain('data-testid="mdx-sources"');
    expect(article).toContain('data-testid="guest-cta"');
  });

  it("omits the Sources block when the document declares no footnote definitions", async () => {
    mocks.mdxContent.value = DOC_WITHOUT_SOURCES;
    const html = await renderLesson();

    expect(mocks.sourcesProps).toHaveLength(0);
    expect(html).not.toContain('data-testid="mdx-sources"');
    // The body still renders, still through the split path.
    expect(html).toContain('data-testid="mdx-body"');
    expect(mocks.articleProps[0].sources).toBe("split");
  });

  it("marks the wrapper with the audio state the anchor offset reads", async () => {
    const html = await renderLesson();
    // No narration in this fixture → `--lesson-anchor-offset` resolves to 96px
    // through `.lesson-page:not(.lesson-page--has-audio)`.
    expect(html).toContain("lesson-page");
    expect(html).not.toContain("lesson-page--has-audio");
  });
});
