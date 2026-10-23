/**
 * /atlas hub page — identity + catalogue wiring (perf P1, review of t_d3c401c9).
 *
 * The page must stay PRERENDERABLE: it resolves the visitor through the
 * cookie-backed DATA client (`supabase.auth.getUser()`) and never through
 * `getAccessUserId()` / Managed Better Auth, whose `next/headers` adapter
 * (`cookies()` + `headers()`) is a dynamic API that flips the route to ƒ and
 * costs the public hub its CDN cache. These tests lock the wiring: one cookie
 * read drives BOTH the gate prop and the catalogue `userId`, and the module
 * does not import `getAccessUserId`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getUser = vi.fn();
  const getCatalogForUserV2 = vi.fn();
  const getCatalogOrg = vi.fn();
  const getAccessUserId = vi.fn();
  return { mocks: { getUser, getCatalogForUserV2, getCatalogOrg, getAccessUserId } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({ auth: { getUser: mocks.getUser } }),
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

import Page from "./page";

const org = {
  sections: [{ id: "s1", slug: "certifications", name: "Certifications" }],
  groups: [{ id: "g1", slug: "sf", name: "Salesforce", section_id: "s1" }],
  prerequisites: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getCatalogForUserV2.mockResolvedValue({
    courses: [{ slug: "agentic-ai", name: "Agentic AI" }],
    isAdmin: false,
  });
  mocks.getCatalogOrg.mockResolvedValue(org);
});

describe("/atlas — prerender-safe identity wiring", () => {
  it("guest: reads identity from the data client only and renders the guest gate", async () => {
    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain('data-gate="guest-locked"');
    // Comment-tolerant: SSR inserts <!-- --> between JSX text nodes.
    expect(html).toMatch(/cards:(<!-- -->)?1/);
    // Guest catalogue → null userId, resolved from the cookie read, not Neon.
    expect(mocks.getCatalogForUserV2).toHaveBeenCalledWith(null);
    expect(mocks.getAccessUserId).not.toHaveBeenCalled();
  });

  it("signed-in: the SAME cookie read feeds the gate and the catalogue userId", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
      error: null,
    });

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain('data-gate="signed-in"');
    expect(mocks.getCatalogForUserV2).toHaveBeenCalledWith("u1");
    expect(mocks.getAccessUserId).not.toHaveBeenCalled();
  });

  it("a failing session read degrades to guest instead of throwing", async () => {
    mocks.getUser.mockRejectedValue(new Error("no session store"));

    const { default: R } = await import("react-dom/server");
    const html = R.renderToString((await Page()) as never);

    expect(html).toContain('data-gate="guest-locked"');
    expect(mocks.getCatalogForUserV2).toHaveBeenCalledWith(null);
  });
});
