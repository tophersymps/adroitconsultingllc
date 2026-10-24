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

const { cookiesMock, sessionUserRef } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  sessionUserRef: { current: null as { id: string; email: string; name: null } | null },
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

/**
 * Identity is mocked at the canonical seam (`src/lib/session.ts`) so the suite
 * can drive BOTH cases: the real Neon SDK cannot mint a signed session cookie
 * here, so without this the resolved identity is always guest and the
 * signed-in branch of the gate (the one that reads a role) is never exercised.
 */
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    getSessionUser: async () => sessionUserRef.current,
    getSessionUserId: async () => sessionUserRef.current?.id ?? null,
  };
});

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
  sessionUserRef.current = null;
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

});

/**
 * The signed-in case (t_cf1e430f). A caller whose SESSION resolves still needs a
 * role read, and that read is the one the degraded client refuses: the sentinel
 * used to escape the gate and every admin handler answered 500. The gate must
 * map it to the same uniform 403 as a guest (CWE-755), never a 5xx.
 */
describe("admin API under a token-route 429, signed-in caller (t_cf1e430f)", () => {
  for (const route of ADMIN_ROUTES) {
    for (const method of route.methods) {
      it(`${method} ${route.path} answers 403 Forbidden, never 500`, async () => {
        sessionUserRef.current = {
          id: "user-1",
          email: "signed-in@example.test",
          name: null,
        };
        captured = installThrottledAuth({
          sessionUser: { id: "user-1", email: "signed-in@example.test" },
        });
        const mod = (await import(route.module)) as Record<string, Handler | undefined>;
        const handler = mod[method];
        expect(handler, `${method} not exported by ${route.module}`).toBeTypeOf("function");

        const res = await handler!(req(method, route.path), PARAMS);

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Forbidden" });
        // The role read never reached the network: the degraded client answered
        // locally with the classified sentinel and the gate denied.
        expect(dataApiRequests(captured)).toHaveLength(0);
      });
    }
  }
});

