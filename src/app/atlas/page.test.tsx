/**
 * /atlas hub page — prerender wiring (perf P1, review of t_d3c401c9; QA F1/F2
 * on t_3a3d6595).
 *
 * The route MUST be prerendered (○) in a production-configured build, i.e. with
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` present. The
 * catalogue reads are cookie-bound (`cookies()` = dynamic API), so the page
 * declares `dynamic = "force-static"` and resolves NO identity at all: any
 * cookie/header read here would flip the route to ƒ and cost the public hub its
 * CDN cache. These tests lock that wiring plus the rendered content (course
 * links in the JSON-LD ItemList, not just route mode).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getCatalogForUserV2 = vi.fn();
  const getCatalogOrg = vi.fn();
  const getAccessUserId = vi.fn();
  return {
    mocks: {
      getSupabaseServerClient,
      getCatalogForUserV2,
      getCatalogOrg,
      getAccessUserId,
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: mocks.getCatalogForUserV2,
  toLearnHubCards: (courses: unknown[]) => courses,
}));

vi.mock("@/lib/access", () => ({
  getCatalogOrg: mocks.getCatalogOrg,
  // Present so a regression to the dynamic-read seam is visible, not silent.
  getAccessUserId: mocks.getAccessUserId,
}));

vi.mock("@/lib/seo", () => ({
  siteConfig: { url: "https://adroit.io" },
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/Learn/LearnHub", () => ({
  default: (props: { courses: unknown[]; gate: string }) => (
    <div data-testid="learn-hub" data-gate={props.gate}>
      cards:{props.courses.length}
    </div>
  ),
}));

import Page, { dynamic as routeDynamic, revalidate } from "./page";

const org = {
  sections: [{ id: "s1", slug: "certifications", name: "Certifications" }],
  groups: [{ id: "g1", slug: "sf", name: "Salesforce", section_id: "s1" }],
  prerequisites: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCatalogForUserV2.mockResolvedValue({
    courses: [
      { slug: "agentic-ai", name: "Agentic AI" },
      { slug: "salesforce-admin", name: "Salesforce Administrator" },
    ],
    isAdmin: false,
  });
  mocks.getCatalogOrg.mockResolvedValue(org);
});

describe("/atlas — prerender-safe wiring", () => {
  it("declares a static route (force-static), so env-complete builds cannot emit ƒ", () => {
    expect(routeDynamic).toBe("force-static");
  });

  it("renders the guest projection without resolving identity", async () => {
    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain('data-gate="guest-locked"');
    // Comment-tolerant: SSR inserts <!-- --> between JSX text nodes.
    expect(html).toMatch(/cards:(<!-- -->)?2/);
    expect(mocks.getCatalogForUserV2).toHaveBeenCalledWith(null);
    // No session read at all: cookies() would flip the route back to ƒ.
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.getAccessUserId).not.toHaveBeenCalled();
  });

  it("prerenders course content (ItemList JSON-LD with /atlas/<slug> URLs)", async () => {
    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain("ItemList");
    expect(html).toContain("https://adroit.io/atlas/agentic-ai");
    expect(html).toContain("Salesforce Administrator");
  });

  it("degrades to an empty hub instead of throwing when the catalogue is unreachable (runtime path)", async () => {
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("Supabase URL and anon key are required"));

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain('data-gate="guest-locked"');
    expect(html).toMatch(/cards:(<!-- -->)?0/);
  });

  it("is ISR-revalidated hourly (static + revalidate = 3600, SEO-M2)", () => {
    expect(revalidate).toBe(3600);
  });
});

describe("/atlas — empty-catalogue prerender guard (SEO-M2)", () => {
  const originalPhase = process.env.NEXT_PHASE;

  afterEach(() => {
    if (originalPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = originalPhase;
  });

  it("fails the BUILD when the catalogue read throws (no empty hub gets published)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("connection refused"));

    await expect(Page()).rejects.toThrow(/atlas prerender aborted/i);
    await expect(Page()).rejects.toThrow(/connection refused/);
  });

  it("fails the BUILD when the catalogue resolves to zero visible courses", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    await expect(Page()).rejects.toThrow(/0 visible courses/);
  });

  it("does NOT fail the build when Supabase env is absent (env-less CI/local builds)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("Supabase URL and anon key are required"));

    try {
      const { default: R } = await import("react-dom/server");
      const html = R.renderToString((await Page()) as never);
      expect(html).toMatch(/cards:(<!-- -->)?0/);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
    }
  });

  it("renders normally during the build when the catalogue resolves", async () => {
    process.env.NEXT_PHASE = "phase-production-build";

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?2/);
    expect(html).toContain("https://adroit.io/atlas/agentic-ai");
  });
});
