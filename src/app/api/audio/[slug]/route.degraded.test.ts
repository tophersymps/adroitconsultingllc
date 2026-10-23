/**
 * route.degraded.test.ts — R2-5 forced-429 regression for
 * GET /api/audio/[slug] (t_ffe32443).
 *
 * The stream route is auth-gated: no resolvable session ⇒ 401 with an EMPTY
 * body (never a public URL, never a partial stream, never a 5xx that would
 * admit the object exists). Under a token-route 429 a members-only lesson read
 * cannot clear its entitlement check, so the gate must stay opaque.
 *
 * Only `fetch` is stubbed; the real route, `db/server.ts` and the access seam
 * run. The slug used is a real members-only lesson narration, so the test
 * exercises the access-seam branch rather than the article (auth-only) one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { GET } from "./route";
import { articleAudio } from "@/data/audio";
import { lessonAudio } from "@/data/lesson-audio";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  dataApiRequests,
  installThrottledAuth,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

/**
 * Pick a slug that is a lesson narration and NOT an article narration, so the
 * request reaches the entitlement gate (the article path is auth-only).
 */
function membersOnlySlug(): string {
  const articleSlugs = new Set(articleAudio.map((a) => a.slug));
  const candidate = lessonAudio.find((a) => !articleSlugs.has(a.slug));
  if (!candidate) throw new Error("no members-only lesson audio in the catalogue");
  return candidate.slug;
}

function request(slug: string) {
  return GET(new NextRequest(`http://localhost:3000/api/audio/${slug}`), {
    params: Promise.resolve({ slug }),
  });
}

let captured: CapturedRequest[] = [];

beforeEach(() => {
  applyThrottledAuthEnv();
  captured = [];
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("GET /api/audio/[slug] under a token-route 429 (R2-5)", () => {
  it("answers 401 with an empty body — the gate stays opaque", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await request(membersOnlySlug());

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("");
    expect(res.headers.get("content-type")).toBeNull();
  });

  it("issues no Data API request and never exposes a storage URL", async () => {
    captured = installThrottledAuth({
      sessionUser: { id: "user-1", email: "learner@test.dev" },
    });

    const res = await request(membersOnlySlug());

    expect(dataApiRequests(captured)).toHaveLength(0);
    expect(JSON.stringify([...res.headers])).not.toMatch(/https?:\/\//);
  });
});
