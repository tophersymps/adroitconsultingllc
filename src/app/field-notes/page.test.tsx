/**
 * /field-notes — prerender wiring + initial-HTML content (t_dc2f7d85).
 *
 * TWO things must hold at once, and this file locks both:
 *
 * 1. The route is prerendered (○) + ISR, i.e. it uses NO request-time API. It
 *    used to `await searchParams`, which rendered the blog index per request —
 *    measured 2026-11-15, crawlers re-fetched it ~860x/day while the Hobby
 *    project sat at 90.8% of its Fluid Active CPU allowance. Any `await
 *    searchParams` / `cookies()` / `headers()` here silently flips the route back
 *    to ƒ and undoes that saving, so the route config is asserted directly.
 *
 * 2. The unfiltered first page is still IN THE INITIAL HTML (hero + featured +
 *    the first 8 cards) — the LCP/CWV contract from Brainiac #3/#9. That is why
 *    the island is not allowed to use `useSearchParams()`: on a prerendered route
 *    it bails the subtree out to client-side rendering and the cards vanish from
 *    the document. Rendering the page with react-dom/server (no client JS, no
 *    hydration) is exactly the "view-source" acceptance check.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

vi.mock("@/lib/hooks/useProgressSummary", () => ({
  useProgressSummary: () => ({
    merge: { read: new Set() },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isLoading: false, refresh: vi.fn() }),
}));

vi.mock("@/lib/hooks/useReadProgress", () => ({
  useReadProgress: () => ({ isRead: false, markAsRead: vi.fn(), isLoading: false }),
}));

import Page, { dynamic as routeDynamic, revalidate } from "./page";
import { posts } from "@/data/posts";

async function html(): Promise<string> {
  const { default: R } = await import("react-dom/server");
  return R.renderToString(Page() as never);
}

describe("/field-notes — prerender wiring (t_dc2f7d85)", () => {
  it("declares a static route (force-static), so request APIs cannot re-dynamize it", () => {
    expect(routeDynamic).toBe("force-static");
  });

  it("is ISR-revalidated hourly (static + revalidate = 3600, matching /atlas)", () => {
    expect(revalidate).toBe(3600);
  });

  it("passes no searchParams to the island (nothing request-time is read)", async () => {
    // The page must not import the `searchParams` prop at all: a prop that
    // changes per request is what made the route dynamic.
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("src/app/field-notes/page.tsx", `file://${process.cwd()}/`),
      "utf8",
    );
    // Strip comments: the doc block legitimately NAMES the APIs it avoids.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/searchParams/);
    expect(code).not.toMatch(/next\/headers|from "next\/server"/);
    expect(source).toMatch(/export const dynamic = "force-static"/);
  });
});

describe("/field-notes — unfiltered first page is in the initial HTML", () => {
  it("renders the hero and the featured post without client JS", async () => {
    const out = await html();
    const featured = posts.find((p) => p.featured);
    expect(featured, "the dataset must carry a featured post").toBeDefined();

    expect(out).toContain("Field Notes");
    expect(out).toContain(`href="/field-notes/${featured!.slug}"`);
  });

  it("renders the first 8 post cards alongside the featured hero", async () => {
    const out = await html();
    // One link per card (PostCard / FeaturedPost) in the 2-column grid: featured
    // + 8/page, i.e. the pagination contract the island renders server-side.
    const cardLinks = out.match(/href="\/field-notes\//g) ?? [];
    expect(cardLinks).toHaveLength(9);
  });

  it("does not emit the Suspense/CSR fallback that useSearchParams() would force", async () => {
    const out = await html();
    expect(out).not.toContain("Loading posts");
  });
});
