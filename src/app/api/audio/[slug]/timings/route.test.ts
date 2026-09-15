/**
 * timings route.test.ts — GET /api/audio/[slug]/timings auth gate + contract.
 *
 * Mirrors the MP3 route test: mocked Supabase clients, asserts the 200/401/404
 * matrix and locks the DoD-4 contract that the manifest is served as JSON from
 * the PRIVATE bucket via the entry's timingsStoragePath — never a public URL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const SLUG = "agent-eval-infrastructure-2026";
const unknownSlug = "this-slug-does-not-exist-xyz";

let authed = true;
let objectAvailable = true;
let timingDownloadError: { message: string } | null = null;
let hasTimingsPath = true; // entry carries timingsStoragePath
const fakeTimings = JSON.stringify([
  { text: "Section: Introduction.", startSec: 0, endSec: 3 },
  { text: "The architecture evolved significantly.", startSec: 3, endSec: 6 },
]);

const serverClient = {
  auth: {
    getUser: async () =>
      authed
        ? { data: { user: { id: "u1", email: "a@b.c" } }, error: null }
        : { data: { user: null }, error: null },
  },
};

const serviceClient = {
  storage: {
    from: () => ({
      download: async () =>
        objectAvailable
          ? { data: new Blob([fakeTimings], { type: "application/json" }), error: null }
          : { data: null, error: timingDownloadError },
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => serverClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => serviceClient,
}));

const TIMINGS_KEY = "blog/agent-eval-infrastructure-2026/af_heart.timing.json";

// Deterministic articleAudio: a pilot entry that carries timingsStoragePath,
// plus the unknown slug resolved to nothing by the route's .find().
const toyAudio = [
  { slug: SLUG, voice: "af_heart", storagePath: "blog/agent-eval-infrastructure-2026/af_heart.mp3", timingsStoragePath: TIMINGS_KEY },
];
vi.mock("@/data/audio", () => ({
  get articleAudio() {
    return hasTimingsPath ? toyAudio : [{ ...toyAudio[0], timingsStoragePath: undefined }];
  },
}));

function makeGet(slug: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/audio/${slug}/timings`, {
    method: "GET",
  });
}

describe("GET /api/audio/[slug]/timings", () => {
  beforeEach(() => {
    authed = true;
    objectAvailable = true;
    timingDownloadError = null;
    hasTimingsPath = true;
    vi.clearAllMocks();
  });

  it("returns 401 for an unauthenticated request", async () => {
    authed = false;
    const res = await GET(makeGet(SLUG), {
      params: Promise.resolve({ slug: SLUG }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown slug even when authenticated", async () => {
    const res = await GET(makeGet(unknownSlug), {
      params: Promise.resolve({ slug: unknownSlug }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the entry has no timingsStoragePath (pre-Tier-C)", async () => {
    hasTimingsPath = false;
    const res = await GET(makeGet(SLUG), {
      params: Promise.resolve({ slug: SLUG }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the private manifest object is missing", async () => {
    objectAvailable = false;
    timingDownloadError = { message: "The resource was not found" };
    const res = await GET(makeGet(SLUG), {
      params: Promise.resolve({ slug: SLUG }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 application/json {segments} for an authed, manifest-present request", async () => {
    const res = await GET(makeGet(SLUG), {
      params: Promise.resolve({ slug: SLUG }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = JSON.parse(await res.text());
    expect(Array.isArray(body.segments)).toBe(true);
    expect(body.segments[0]).toEqual({
      text: "Section: Introduction.",
      startSec: 0,
      endSec: 3,
    });
  });

  it("never emits a public URL or the raw bucket key in the body", async () => {
    const res = await GET(makeGet(SLUG), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const body = await res.text();
    expect(body).not.toContain("https://");
    expect(body).not.toContain(TIMINGS_KEY);
    expect(TIMINGS_KEY).toMatch(/^blog\/.+\/.+\.timing\.json$/);
  });
});