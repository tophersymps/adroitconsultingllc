/**
 * completion-write.test.ts — appendCompletionEvent write path (t_bd7ac2a0, M2).
 *
 * Migration 012 closes the RLS client-forge path (CWE-807) on completion_events:
 * the `authenticated` role's INSERT is denied, so completion rows can only be
 * written by the service_role client (BYPASSRLS), never by an anon-key / cookie
 * client using a user JWT to hit PostgREST directly. This test pins the write
 * seam: appendCompletionEvent MUST route its INSERT through the service-role
 * client — never the RLS-bound getSupabaseServerClient() — or server writes
 * would break once the deny-guard lands.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const serverFrom = vi.fn();
  const serviceFrom = vi.fn();
  const insert = vi.fn();
  return { mocks: { serverFrom, serviceFrom, insert } };
});

// RLS-bound (cookie/anon) client: SELECT only — no `.insert` exposed.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ from: mocks.serverFrom }),
}));

// Service-role client: exposes the INSERT on completion_events.
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ from: mocks.serviceFrom }),
}));

import { appendCompletionEvent } from "@/lib/completion";

/** Recursive idempotency SELECT chain (eq may repeat per filter present). */
function selectChain(maybeSingleResult: unknown) {
  return {
    eq: () => selectChain(maybeSingleResult),
    limit: () => ({ maybeSingle: async () => maybeSingleResult }),
  };
}

/** RLS-bound (anon/cookie) client: supports SELECT only, never INSERT. */
function serverFrom(table: string) {
  if (table === "completion_events") {
    return { select: () => selectChain({ data: null, error: null }) };
  }
  return {};
}

/** Service client: exposes the INSERT on completion_events. */
function serviceFrom(table: string) {
  if (table === "completion_events") {
    return { insert: mocks.insert };
  }
  return {};
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.serverFrom.mockImplementation(serverFrom);
  mocks.serviceFrom.mockImplementation(serviceFrom);
});

describe("appendCompletionEvent — server-write-only via service client (M2)", () => {
  it("writes the completion INSERT through the service client", async () => {
    await appendCompletionEvent({
      userId: "user-1",
      courseId: "c1",
      eventType: "course",
    });

    // The write went through the service client's from("completion_events").
    expect(mocks.serviceFrom).toHaveBeenCalledWith("completion_events");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: "user-1",
      course_id: "c1",
      event_type: "course",
    });
  });

  it("routes the INSERT via the service client, not the RLS-bound (anon) client", async () => {
    await appendCompletionEvent({
      userId: "user-1",
      courseId: null,
      eventType: "lesson",
      lessonSlug: "l1",
    });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    // The service client's from was the writer.
    expect(mocks.serviceFrom).toHaveBeenCalledWith("completion_events");
    // The RLS-bound client only served the idempotency SELECT (its from mock
    // exposes no `.insert` — that client is not a valid write path).
    expect(mocks.serverFrom).toHaveBeenCalledWith("completion_events");
  });

  it("is idempotent: skips the write when an identical event already exists", async () => {
    // Existing row → idempotency guard short-circuits before the write.
    mocks.serverFrom.mockImplementation(() => ({
      select: () => selectChain({ data: { id: 99 }, error: null }),
    }));

    await appendCompletionEvent({
      userId: "user-1",
      courseId: "c1",
      eventType: "course",
    });

    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
