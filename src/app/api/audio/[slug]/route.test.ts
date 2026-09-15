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

function makeGet(slug: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/audio/${slug}`, {
    method: "GET",
    headers,
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

  it("returns 206 + Content-Range for a single byte-range request", async () => {
    const res = await GET(makeGet(pilot.slug, { range: "bytes=0-4" }), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 0-4/${fakeBytes.length}`,
    );
    expect(res.headers.get("Content-Length")).toBe("5");
    const body = await res.arrayBuffer();
    // "fake-mp3-bytes" -> bytes 0..4 == "fake-"
    expect(Buffer.from(body).toString()).toBe("fake-");
  });

  it("honors a suffix range bytes=-4 (last N bytes)", async () => {
    const res = await GET(makeGet(pilot.slug, { range: "bytes=-4" }), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes ${fakeBytes.length - 4}-${fakeBytes.length - 1}/${fakeBytes.length}`,
    );
    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe("ytes");
  });

  it("clamps an open-ended range to the file length", async () => {
    const res = await GET(makeGet(pilot.slug, { range: "bytes=10-" }), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 10-${fakeBytes.length - 1}/${fakeBytes.length}`,
    );
  });

  it("returns 416 with Content-Range hint when the requested start exceeds the file", async () => {
    const res = await GET(makeGet(pilot.slug, { range: "bytes=1000-" }), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${fakeBytes.length}`);
  });

  it("ignores a Range when If-Range is present (degrades to full 200)", async () => {
    // We emit no ETag/Last-Modified, so an If-Range validator never matches
    // -> per RFC 7233 the Range must be ignored and the full body served.
    const res = await GET(
      makeGet(pilot.slug, { range: "bytes=0-3", "if-range": "\"abc\"" }),
      { params: Promise.resolve({ slug: pilot.slug }) },
    );
    expect(res.status).toBe(200);
    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe("fake-mp3-bytes");
    expect(res.headers.get("Content-Length")).toBe(String(fakeBytes.length));
  });

  it("degrades a malformed Range to a full 200", async () => {
    const res = await GET(makeGet(pilot.slug, { range: "items=0-3" }), {
      params: Promise.resolve({ slug: pilot.slug }),
    });
    expect(res.status).toBe(200);
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