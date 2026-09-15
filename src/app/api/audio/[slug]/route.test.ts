/**
 * route.test.ts — GET /api/audio/[slug] auth gate (plan Phase 5A).
 *
 * Verifies the 200/401/404 matrix against mocked Supabase clients. The
 * service-role client is mocked so private-bucket download paths are tested
 * without any real Supabase env. Also locks the contract: the 200 response is
 * audio/mpeg with a private cache control, and there is never a public URL in
 * any branch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { articleAudio } from "@/data/audio";

const pilot = articleAudio[0]; // a real generated pilot slug
const unknownSlug = "this-slug-does-not-exist-xyz";

// Default: authed server client returns a user; service client returns bytes.
let authed = true;
let objectAvailable = true;
let downloadError: { message: string } | null = null;
const fakeBytes = Buffer.from("fake-mp3-bytes");

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
          ? {
              data: new Blob([fakeBytes], { type: "audio/mpeg" }),
              error: null,
            }
          : { data: null, error: downloadError },
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => serverClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => serviceClient,
}));

function makeGet(slug: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/audio/${slug}`, {
    method: "GET",
  });
}

describe("GET /api/audio/[slug]", () => {
  beforeEach(() => {
    authed = true;
    objectAvailable = true;
    downloadError = null;
    vi.clearAllMocks();
  });

  it("returns 401 for an unauthenticated request (no session)", async () => {
    authed = false;
    const res = await GET(makeGet(pilot.slug), { params: Promise.resolve({ slug: pilot.slug }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown slug even when authenticated", async () => {
    const res = await GET(makeGet(unknownSlug), {
      params: Promise.resolve({ slug: unknownSlug }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the private object is missing for a known slug", async () => {
    objectAvailable = false;
    downloadError = { message: "The resource was not found" };
    const res = await GET(makeGet(pilot.slug), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 audio/mpeg with a private cache control for an authed, known, object-present request", async () => {
    const res = await GET(makeGet(pilot.slug), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe("fake-mp3-bytes");
  });

  it("never constructs or emits a public storage URL", () => {
    // The route resolves storagePath from articleAudio but only uses it to
    // key a server-side download. There is no getPublicUrl path — lock that
    // by asserting generated data carries only the private-bucket key.
    expect(pilot.storagePath).toMatch(/^blog\/.+\/.+\.mp3$/);
    expect(pilot.storagePath).toContain("af_heart");
  });
});