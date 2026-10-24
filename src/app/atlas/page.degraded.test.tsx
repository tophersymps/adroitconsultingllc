/**
 * page.degraded.test.tsx — R2-5 forced-429 regression for the /atlas hub
 * (t_ffe32443, AC-5).
 *
 * The hub is the catalogue entry point: it resolves the session, the catalog and
 * the DB-backed org buckets. Under a token-route 429 none of those reads can go
 * out, and the page must still answer 200 with an empty-but-graceful hub —
 * 5xx kills the entry point and 404 would deindex a live page.
 *
 * Only `fetch` is stubbed; the real page, `db/server.ts`, `lib/access` and
 * `lib/catalog` run. The three layout components are stubbed because they are
 * irrelevant to the contract under test (Header/Footer/LearnHub render the same
 * regardless of data availability).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/Learn/LearnHub", () => ({
  default: ({ courses }: { courses: { slug: string }[] }) => (
    <div data-testid="learn-hub" data-course-count={courses.length}>
      {courses.map((c) => (
        <span key={c.slug}>{c.slug}</span>
      ))}
    </div>
  ),
}));

import LearnLandingPage from "./page";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

let captured: CapturedRequest[] = [];

async function renderHub(): Promise<string> {
  const { default: R } = await import("react-dom/server");
  const result = await LearnLandingPage();
  return R.renderToString(result as never);
}

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("/atlas hub under a token-route 429 (R2-5, AC-5)", () => {
  it("still renders the hub at 200 — no throw, no 5xx", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    const html = await renderHub();

    expect(html).toContain("The Atlas");
    expect(html).toContain('data-testid="learn-hub"');
    expect(html).toContain('data-testid="footer"');
  });

  it("renders an empty-but-graceful catalogue rather than failing the page", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    const html = await renderHub();

    // An empty catalogue is the degraded shape; the shell is fully intact.
    expect(html).toContain('data-course-count="0"');
    expect(html).not.toMatch(/Application error|Internal Server Error|500/);
  });

  it("issues no Data API request when no token can be minted", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await renderHub();

    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
