/**
 * route.test.ts — PATCH /api/admin/courses/[slug] price-change audit (t_10214e52).
 *
 * ADR-205 requires an admin_audit_log row for every admin mutation. A
 * price-only PATCH was previously unaudited (CWE-778): now a
 * course.price_change action (from/to) is written whenever price_cents moves.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getAccessUserId = vi.fn();
  const isAdmin = vi.fn();
  const service = { from: vi.fn() };
  return { mocks: { getAccessUserId, isAdmin, service } };
});

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: mocks.isAdmin },
  getAccessUserId: mocks.getAccessUserId,
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => mocks.service,
}));

import { PATCH } from "./route";

const ADMIN_ID = "user-admin";

const existing = {
  id: "c1",
  series_slug: "my-course",
  status: "live",
  access_model: "free",
  price_cents: 0,
  launched_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/courses/my-course", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function admin() {
  mocks.getAccessUserId.mockResolvedValue(ADMIN_ID);
  mocks.isAdmin.mockResolvedValue(true);
}

function wire(updated: unknown) {
  const auditInserts: unknown[] = [];
  // from("courses"): .select("*").eq().maybeSingle() for the find, and
  // .update().eq().select().single() for the write — select/update are METHODS.
  const fromCourses = {
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({ single: async () => ({ data: updated, error: null }) }),
      }),
    }),
  };
  mocks.service.from.mockImplementation((table: string) => {
    if (table === "courses") return fromCourses;
    if (table === "admin_audit_log") {
      return {
        insert: async (row: unknown) => {
          auditInserts.push(row);
          return { error: null };
        },
      };
    }
    return {};
  });
  return auditInserts;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockReset();
  mocks.getAccessUserId.mockReset();
  mocks.service.from.mockReset();
});

describe("PATCH /api/admin/courses/[slug] — price-change audit (t_10214e52)", () => {
  it("writes a course.price_change audit row for a price-only PATCH", async () => {
    admin();
    const auditInserts = wire({ ...existing, price_cents: 9900 });
    const res = await PATCH(req({ price_cents: 9900 }), {
      params: Promise.resolve({ slug: "my-course" }),
    });
    expect(res.status).toBe(200);
    const priceAudit = auditInserts.find(
      (a) => (a as { action: string }).action === "course.price_change",
    );
    expect(priceAudit).toBeTruthy();
    expect(priceAudit).toMatchObject({
      action: "course.price_change",
      target_type: "course",
      target_id: "my-course",
      details: { from: 0, to: 9900 },
    });
  });

  it("writes NO price audit row when price is unchanged", async () => {
    admin();
    const auditInserts = wire({ ...existing, status: "archived" });
    // status change only (price stays 0)
    const res = await PATCH(req({ status: "archived" }), {
      params: Promise.resolve({ slug: "my-course" }),
    });
    expect(res.status).toBe(200);
    expect(auditInserts.some((a) => (a as { action: string }).action === "course.price_change")).toBe(false);
  });
});

describe("PATCH /api/admin/courses/[slug] — Learn v2 profile round-trip (t_f94e01d5)", () => {
  it("persists org + profile fields and writes a course.profile_change audit row", async () => {
    admin();
    // Capture the update() payload so we can assert what reached the DB.
    let updatePayload: Record<string, unknown> | null = null;
    const fromCourses = {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
      }),
      update: (updates: Record<string, unknown>) => {
        updatePayload = updates;
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { ...existing, ...updates }, error: null }) }),
          }),
        };
      },
    };
    const auditInserts: unknown[] = [];
    mocks.service.from.mockImplementation((table: string) => {
      if (table === "courses") return fromCourses;
      if (table === "admin_audit_log") {
        return {
          insert: async (row: unknown) => {
            auditInserts.push(row);
            return { error: null };
          },
        };
      }
      return {};
    });

    const res = await PATCH(
      req({
        section_id: "sec-1",
        group_id: "grp-1",
        track: "hermes-consultant",
        level: 2,
        sort_order: 20,
        difficulty: "Intermediate",
        recommended_background: "Completion of Level 1.",
        audience: "Working practitioners",
        learning_outcomes: ["Run a full engagement", "Estimate multi-week delivery"],
        course_tags: ["Consulting", "Delivery"],
      }),
      { params: Promise.resolve({ slug: "my-course" }) },
    );
    expect(res.status).toBe(200);
    // Every Learn v2 field reached the DB update payload.
    expect(updatePayload).toMatchObject({
      section_id: "sec-1",
      group_id: "grp-1",
      track: "hermes-consultant",
      level: 2,
      sort_order: 20,
      difficulty: "Intermediate",
      recommended_background: "Completion of Level 1.",
      audience: "Working practitioners",
      learning_outcomes: ["Run a full engagement", "Estimate multi-week delivery"],
      course_tags: ["Consulting", "Delivery"],
    });
    // One aggregated audit row names the changed profile fields (ADR-208/205).
    const profileAudit = auditInserts.find(
      (a) => (a as { action: string }).action === "course.profile_change",
    );
    expect(profileAudit).toBeTruthy();
    const details = (profileAudit as { details: Record<string, { from: unknown; to: unknown }> }).details;
    expect(details).toHaveProperty("level");
    expect(details).toHaveProperty("learning_outcomes");
    expect(details).toHaveProperty("course_tags");
    expect(details["level"]).toEqual({ from: null, to: 2 });
  });

  it("rejects invalid difficulty / level / tags", async () => {
    admin();
    wire(existing);
    const badDiff = await PATCH(req({ difficulty: "Expert" }), {
      params: Promise.resolve({ slug: "my-course" }),
    });
    expect(badDiff.status).toBe(400);
    const badLevel = await PATCH(req({ level: 2.5 }), {
      params: Promise.resolve({ slug: "my-course" }),
    });
    expect(badLevel.status).toBe(400);
    const badTags = await PATCH(req({ course_tags: [123] }), {
      params: Promise.resolve({ slug: "my-course" }),
    });
    expect(badTags.status).toBe(400);
  });
});
