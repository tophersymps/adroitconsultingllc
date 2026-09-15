/**
 * route.test.ts — POST /api/progress/lesson (security t_7469e31d F5).
 *
 * The lesson-completion API must reject slugs outside the canonical lesson
 * set so a forged request cannot fabricate completion for non-existent or
 * foreign lessons (which would otherwise satisfy the certificate's "all
 * lessons completed" rule). The canonical set is the union of published
 * lesson data + the generator's planned per-lesson question files.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getUser = vi.fn();
  const from = vi.fn();
  return {
    mocks: { getSupabaseServerClient, getUser, from },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

// completion_events INSERT now routes via the service-role client (M2,
// t_bd7ac2a0, migration 012) — point it at the same fake so the route's
// completion-event append assertions still observe the write.
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ from: mocks.from }),
}));

// The lesson route now gates writes through the access seam (US-006). The
// canonical slug under test belongs to a live course, so the seam grants it.
vi.mock("@/lib/access", () => ({
  accessSeam: {
    decideCourseAccess: async () => ({ kind: "granted" }),
  },
}));

import { POST } from "./route";

// Real canonical lesson slug (content/learn/omni-studio-cert/questions/…).
const CANONICAL_SLUG = "day-01-f1-omnistudio-solution-and-industry-use-cases";

function post(lessonSlug: string): Promise<Response> {
  return POST(
    new NextRequest("http://localhost:3000/api/progress/lesson", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.1.1" },
      body: JSON.stringify({ lessonSlug }),
    }),
  );
}

const writeSink = { upserts: [] as unknown[] };

beforeEach(() => {
  vi.clearAllMocks();
  writeSink.upserts.length = 0;
  mocks.from.mockImplementation(() => ({
    upsert: async (row: unknown) => {
      writeSink.upserts.push(row);
      return { error: null };
    },
  }));
});

describe("POST /api/progress/lesson — canonical slug gate (F5)", () => {
  it("rejects a non-existent lesson slug with 400 before any write", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await post("day-99-no-such-lesson");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown lesson slug");
    expect(writeSink.upserts).toHaveLength(0);
  });

  it("rejects a charset-valid but foreign slug (no dots/slashes, still not canonical)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await post("not-a-real-lesson-slug");
    expect(res.status).toBe(400);
    expect(writeSink.upserts).toHaveLength(0);
  });

  it("accepts a canonical lesson slug and records completion", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await post(CANONICAL_SLUG);
    expect(res.status).toBe(200);
    expect(writeSink.upserts).toHaveLength(1);
    expect(writeSink.upserts[0]).toMatchObject({
      user_id: "user-1",
      lesson_slug: CANONICAL_SLUG,
    });
  });

  it("returns unauthenticated before the slug gate for guests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post("day-99-no-such-lesson");
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("unauthenticated");
    expect(writeSink.upserts).toHaveLength(0);
  });
});

describe("POST /api/progress/lesson — completion_events append (plan §3f / ADR-211)", () => {
  const completionInserts: unknown[] = [];

  function chainableFrom(table: string) {
    const c: Record<string, unknown> = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => c),
      limit: vi.fn(() => c),
      order: vi.fn(() => c),
      delete: vi.fn(() => c),
      upsert: vi.fn(async () => ({ error: null })),
      insert: vi.fn(async (rows: unknown) => {
        completionInserts.push(...(Array.isArray(rows) ? rows : [rows]));
        return { error: null };
      }),
      maybeSingle: vi.fn(async () =>
        table === "courses"
          ? { data: { id: "course-1" }, error: null }
          : { data: null, error: null },
      ),
    };
    // lesson_completion count query resolves a high count → triggers course event
    if (table === "lesson_completion") {
      c.select = vi.fn(() => ({
        ...c,
        eq: vi.fn(() => ({ ...c, in: vi.fn(async () => ({ count: 999, error: null })) })),
      }));
    }
    return c;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    completionInserts.length = 0;
    mocks.from.mockImplementation((table: string) => chainableFrom(table));
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("appends a 'lesson' event and a 'course' event on the last lesson", async () => {
    const res = await post(CANONICAL_SLUG);
    expect(res.status).toBe(200);

    const lessonInserts = completionInserts.filter(
      (r) => (r as { event_type: string }).event_type === "lesson",
    );
    const courseInserts = completionInserts.filter(
      (r) => (r as { event_type: string }).event_type === "course",
    );

    expect(lessonInserts).toHaveLength(1);
    expect(lessonInserts[0]).toMatchObject({
      user_id: "user-1",
      course_id: "course-1",
      event_type: "lesson",
      lesson_slug: CANONICAL_SLUG,
    });
    // high count → course completion event also appended
    expect(courseInserts).toHaveLength(1);
    expect(courseInserts[0]).toMatchObject({
      user_id: "user-1",
      course_id: "course-1",
      event_type: "course",
    });
  });

  it("does not append when the lesson is unknown (gate rejects before any write)", async () => {
    const res = await post("day-99-no-such-lesson");
    expect(res.status).toBe(400);
    expect(completionInserts).toHaveLength(0);
  });
});
