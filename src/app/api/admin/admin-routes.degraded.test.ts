/**
 * admin-routes.degraded.test.ts — R2-5 forced-429 regression for the admin
 * API surface (t_ffe32443).
 *
 * Every admin handler gates FIRST through `requireAdminApi()`, which resolves
 * identity via the session and the role via the Data API. Under a token-route
 * 429 the role read cannot happen, so a non-admin caller must still be answered
 * the uniform `403 {"error":"Forbidden"}` — the same answer a plain guest gets.
 * The failure mode this pins: an unhandled `DbTokenUnavailableError` escaping the
 * gate and turning every admin surface into a 500 (which would also reveal that
 * the route exists and is reachable).
 *
 * Only `fetch` is stubbed; the real route modules, `db/server.ts`, the access
 * seam and `lib/admin.ts` run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  guestCookieStore,
  installThrottledAuth,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const PARAMS = { params: Promise.resolve({ slug: "omni-studio-cert", id: "user-1" }) };

function req(method: string, path: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "GET" || method === "DELETE"
      ? {}
      : { body: JSON.stringify({}) }),
  });
}

/**
 * Every admin route module and the `[method, path]` pairs its handlers gate on
 * `requireAdminApi`. Kept as data so a NEW admin route with no degraded test is
 * one line away from being covered.
 */
const ADMIN_ROUTES: { module: string; path: string; methods: string[] }[] = [
  { module: "./access/effective/route", path: "/api/admin/access/effective", methods: ["GET"] },
  { module: "./analytics/route", path: "/api/admin/analytics", methods: ["GET"] },
  { module: "./audit/route", path: "/api/admin/audit", methods: ["GET"] },
  { module: "./catalog/groups/route", path: "/api/admin/catalog/groups", methods: ["GET", "POST"] },
  { module: "./catalog/sections/route", path: "/api/admin/catalog/sections", methods: ["GET", "POST"] },
  { module: "./courses/route", path: "/api/admin/courses", methods: ["GET"] },
  { module: "./courses/[slug]/route", path: "/api/admin/courses/omni-studio-cert", methods: ["PATCH"] },
  {
    module: "./courses/[slug]/preview/route",
    path: "/api/admin/courses/omni-studio-cert/preview",
    methods: ["GET"],
  },
  {
    module: "./courses/[slug]/prerequisites/route",
    path: "/api/admin/courses/omni-studio-cert/prerequisites",
    methods: ["GET", "PUT"],
  },
  { module: "./courses/provision/route", path: "/api/admin/courses/provision", methods: ["POST"] },
  { module: "./entitlements/route", path: "/api/admin/entitlements", methods: ["POST", "DELETE"] },
  { module: "./entitlements/bulk/route", path: "/api/admin/entitlements/bulk", methods: ["POST", "DELETE"] },
  { module: "./users/route", path: "/api/admin/users", methods: ["GET"] },
  { module: "./users/[id]/route", path: "/api/admin/users/user-1", methods: ["GET"] },
  { module: "./users/[id]/role/route", path: "/api/admin/users/user-1/role", methods: ["PATCH"] },
];

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(guestCookieStore());
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("admin API under a token-route 429 (R2-5)", () => {
  for (const route of ADMIN_ROUTES) {
    for (const method of route.methods) {
      it(`${method} ${route.path} answers 403 Forbidden`, async () => {
        captured = installThrottledAuth({ sessionUser: null });
        const mod = (await import(route.module)) as Record<string, Handler | undefined>;
        const handler = mod[method];
        expect(handler, `${method} not exported by ${route.module}`).toBeTypeOf("function");

        const res = await handler!(req(method, route.path), PARAMS);

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
        expect(dataApiRequests(captured)).toHaveLength(0);
      });
    }
  }

  // NOTE (found while writing this suite, reported not fixed — see the card
  // completion metadata): for a caller whose SESSION resolves (signed-in user),
  // `requireAdminApi()` runs the role read, the Data API client is degraded, and
  // `loadRole` rethrows `DbTokenUnavailableError` out of the gate — none of the
  // admin handlers wrap the gate in a try/catch, so that caller gets a 500
  // instead of 403. The cookieless case pinned above is the only one this
  // fixture can drive: the Neon SDK cannot mint a signed session cookie here, so
  // identity always resolves to guest in this suite.
});

