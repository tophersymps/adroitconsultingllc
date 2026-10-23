/**
 * /atlas hub page — prerender wiring (perf P1, review of t_d3c401c9; QA F1/F2
 * on t_3a3d6595).
 *
 * The route MUST be prerendered (○) in a production-configured build, i.e. with
 * the Neon Data API endpoint (`NEXT_PUBLIC_NEON_DATA_API_URL`, or the
 * server-only `NEON_DATA_API_URL`) present — the catalogue read has gone
 * through Neon, not Supabase, since R2-2 (t_4b1c9124). The
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

describe("/atlas — empty-catalogue prerender guard (SEO-M2 / SEO-H1)", () => {
  const originalPhase = process.env.NEXT_PHASE;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalGuard = process.env.ATLAS_BUILD_GUARD;

  beforeEach(() => {
    // Plain (non-Vercel) production build: the guard is armed by default.
    delete process.env.VERCEL_ENV;
    delete process.env.ATLAS_BUILD_GUARD;
  });

  afterEach(() => {
    if (originalPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = originalPhase;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalGuard === undefined) delete process.env.ATLAS_BUILD_GUARD;
    else process.env.ATLAS_BUILD_GUARD = originalGuard;
    vi.restoreAllMocks();
  });

  it("WARNS (does not fail) when the catalogue read throws — infra failure is not 'empty catalogue'", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?0/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/build warning[\s\S]*connection refused/),
    );
  });

  it("fails the BUILD when the catalogue resolves to zero visible courses", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    await expect(Page()).rejects.toThrow(/atlas prerender aborted/i);
    await expect(Page()).rejects.toThrow(/0 visible courses/);
  });

  it("does NOT fail the build on a read failure in a Vercel Preview deploy (SEO-H1)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.VERCEL_ENV = "preview";
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("RLS denied"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?0/);
  });

  it("does NOT fail a Preview build even when the catalogue resolves to zero courses", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.VERCEL_ENV = "preview";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?0/);
  });

  it("stays armed on a Vercel PRODUCTION deploy (0 visible courses still fails)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.VERCEL_ENV = "production";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    await expect(Page()).rejects.toThrow(/0 visible courses/);
  });

  it("honours ATLAS_BUILD_GUARD=0 as an explicit opt-out", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.ATLAS_BUILD_GUARD = "0";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?0/);
  });

  it("does NOT fail the build when the Neon data layer is absent (env-less CI/local builds)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const publicUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
    const serverUrl = process.env.NEON_DATA_API_URL;
    delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
    delete process.env.NEON_DATA_API_URL;
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("NEON_DATA_API_URL is required"));

    try {
      const { default: R } = await import("react-dom/server");
      const html = R.renderToString((await Page()) as never);
      expect(html).toMatch(/cards:(<!-- -->)?0/);
    } finally {
      if (publicUrl === undefined) delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
      else process.env.NEXT_PUBLIC_NEON_DATA_API_URL = publicUrl;
      if (serverUrl === undefined) delete process.env.NEON_DATA_API_URL;
      else process.env.NEON_DATA_API_URL = serverUrl;
    }
  });

  it("arms off the Neon catalogue env, NOT the retired Supabase keys (t_4b1c9124)", async () => {
    // A production build that has the Neon Data API endpoint and no Supabase
    // keys at all (i.e. after 2026-11-22) must still refuse to bake an empty hub.
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.NEXT_PUBLIC_NEON_DATA_API_URL =
      "https://stub.apirest.example/neondb/rest/v1";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    await expect(Page()).rejects.toThrow(/0 visible courses/);
  });

  it("is disarmed on that same Neon-configured build by ATLAS_BUILD_GUARD=0", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.NEXT_PUBLIC_NEON_DATA_API_URL =
      "https://stub.apirest.example/neondb/rest/v1";
    process.env.ATLAS_BUILD_GUARD = "0";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toMatch(/cards:(<!-- -->)?0/);
  });

  it("stays armed when only the server-only NEON_DATA_API_URL is exported", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const publicUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
    delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
    process.env.NEON_DATA_API_URL = "https://stub.apirest.example/neondb/rest/v1";
    mocks.getCatalogForUserV2.mockResolvedValue({ courses: [], isAdmin: false });

    try {
      await expect(Page()).rejects.toThrow(/0 visible courses/);
    } finally {
      delete process.env.NEON_DATA_API_URL;
      if (publicUrl === undefined) delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
      else process.env.NEXT_PUBLIC_NEON_DATA_API_URL = publicUrl;
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
