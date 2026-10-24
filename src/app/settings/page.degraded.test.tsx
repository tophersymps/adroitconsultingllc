/**
 * page.degraded.test.tsx — R2-5 forced-429 regression for /settings (t_ffe32443,
 * AC-10 part).
 *
 * The settings page is session-gated: no resolvable session ⇒
 * `redirect("/login?next=/settings")`. Under a token-route 429 the Data API
 * client degrades to guest, so the page must take the documented redirect
 * (307 at the edge) instead of throwing its way to a 500. The failure mode this
 * pins: a session read that degrades must never strand a signed-out visitor on
 * an error page with no way to sign in.
 *
 * Only `fetch` is stubbed; the real page and `db/server.ts` run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import SettingsPage, { metadata } from "./page";
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

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  redirectMock.mockClear();
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("/settings under a token-route 429 (R2-5)", () => {
  it("redirects to /login?next=/settings — the documented guest gate", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await expect(SettingsPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=/settings",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?next=/settings");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  // lara t_e653885e F2 (SEO/a11y MEDIUM): /settings is account-only, absent
  // from the sitemap and normally only reachable through a redirect, so it must
  // never be indexed. Fails on `origin/main` (buildMetadata defaulted to
  // index:true).
  it("declares noindex — /settings is an account-only route", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("issues no Data API request for the guest render", async () => {
    captured = installThrottledAuth({ sessionUser: null });

    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(dataApiRequests(captured)).toHaveLength(0);
  });
});
