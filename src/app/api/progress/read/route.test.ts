/**
 * route.test.ts — POST/DELETE /api/progress/read entitlement gate (t_10214e52).
 *
 * Lesson reads are course-gated through the access seam: a user with no
 * access to the lesson's course must not fabricate read progress in a
 * paywalled course. Blog reads are not part of any course and always pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getUser = vi.fn();
  const from = vi.fn();
  const decideCourseAccess = vi.fn();
  return {
    mocks: { getSupabaseServerClient, getUser, from, decideCourseAccess },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

// The route gates through the access seam (t_10214e52). Default granted.
vi.mock("@/lib/access", () => ({
  accessSeam: { decideCourseAccess: mocks.decideCourseAccess },
}));

import { POST, DELETE } from "./route";

// Real canonical lesson slug (content/learn/omni-studio-cert/…).
const LESSON_CONTENT_SLUG =
  "lesson/day-01-f1-omnistudio-solution-and-industry-use-cases";

const writeSink = { upserts: [] as unknown[], deletes: [] as unknown[] };

function makeFrom() {
  return {
    upsert: async (row: unknown) => {
      writeSink.upserts.push(row);
      return { error: null };
    },
    delete: () => ({
      eq: () => ({
        eq: () => ({
          eq: async () => {
            writeSink.deletes.push(1);
            return { error: null };
          },
        }),
      }),
    }),
  };
}

function authed(id = "user-1") {
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
}

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/progress/read", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeSink.upserts.length = 0;
  writeSink.deletes.length = 0;
  mocks.decideCourseAccess.mockResolvedValue({ kind: "granted" });
  mocks.from.mockImplementation(() => makeFrom());
});

describe("POST /api/progress/read — lesson entitlement gate (t_10214e52)", () => {
  it("allows blog reads without a course gate (blogs are not courses)", async () => {
    authed();
    const res = await POST(req({ contentType: "blog", contentSlug: "blog/hello-world" }));
    expect(res.status).toBe(200);
    expect(writeSink.upserts).toHaveLength(1);
  });

  it("rejects a lesson read for a course the user can't access (403, no write)", async () => {
    authed();
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    const res = await POST(
      req({ contentType: "lesson", contentSlug: LESSON_CONTENT_SLUG }),
    );
    expect(res.status).toBe(403);
    expect(writeSink.upserts).toHaveLength(0);
  });

  it("allows a lesson read for an accessible course", async () => {
    authed();
    const res = await POST(
      req({ contentType: "lesson", contentSlug: LESSON_CONTENT_SLUG }),
    );
    expect(res.status).toBe(200);
    expect(writeSink.upserts).toHaveLength(1);
    expect(writeSink.upserts[0]).toMatchObject({
      content_type: "lesson",
      content_slug: LESSON_CONTENT_SLUG,
    });
  });
});

describe("DELETE /api/progress/read — lesson entitlement gate (t_10214e52)", () => {
  it("rejects unmarking a lesson in a gated course (403, no delete)", async () => {
    authed();
    mocks.decideCourseAccess.mockResolvedValue({ kind: "paywall" });
    const res = await DELETE(
      req({ contentType: "lesson", contentSlug: LESSON_CONTENT_SLUG }),
    );
    expect(res.status).toBe(403);
    expect(writeSink.deletes).toHaveLength(0);
  });

  it("allows unmarking a lesson in an accessible course", async () => {
    authed();
    const res = await DELETE(
      req({ contentType: "lesson", contentSlug: LESSON_CONTENT_SLUG }),
    );
    expect(res.status).toBe(200);
    expect(writeSink.deletes).toHaveLength(1);
  });
});
