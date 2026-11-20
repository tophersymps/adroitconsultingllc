/**
 * src/lib/atlas-disclosure.test.ts — the DB half of the disclosure predicate
 * (t_b4c0da5f, MEDIUM, CWE-200; DB becomes the authority in t_47183b5b).
 *
 * `isSeriesGuestVisible()` must answer three ways: the row is live and
 * non-stealth → true, stealth/delisted or absent → false, credential outage →
 * null (caller falls back to the static snapshot). Any OTHER loader error must
 * propagate — it is a bug, not an outage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getCourseRowBySlug: vi.fn() },
}));

vi.mock("@/lib/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access")>();
  return {
    getCourseRowBySlug: mocks.getCourseRowBySlug,
    // The REAL stealth rule (live && non-granted): the disclosure predicate
    // consumes it, so the test must not restate it.
    isGuestVisibleCourse: actual.isGuestVisibleCourse,
  };
});

import {
  isSeriesGuestVisible,
  mayDiscloseSeriesLive,
} from "@/lib/atlas-disclosure";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSeriesGuestVisible", () => {
  it("returns true for a live non-stealth courses row", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "free",
    });
    expect(await isSeriesGuestVisible("agentic-ai")).toBe(true);
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "sub-or-one-time",
    });
    expect(await isSeriesGuestVisible("ai-adoption")).toBe(true);
  });

  it("returns false for a live granted (stealth) row", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "granted",
    });
    expect(await isSeriesGuestVisible("hermes-consultant")).toBe(false);
  });

  it("returns false for a delisted (pending/archived) row", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "pending",
      access_model: "free",
    });
    expect(await isSeriesGuestVisible("agentic-ai")).toBe(false);
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "archived",
      access_model: "free",
    });
    expect(await isSeriesGuestVisible("agentic-ai")).toBe(false);
  });

  it("returns false when there is no courses row at all (stealth)", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue(null);
    expect(await isSeriesGuestVisible("hermes-consultant")).toBe(false);
  });

  it("returns null on a credential outage so the caller falls back to the snapshot", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    expect(await isSeriesGuestVisible("agentic-ai")).toBeNull();
  });

  it("propagates an unrelated loader failure instead of degrading it", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(new Error("boom"));
    await expect(isSeriesGuestVisible("agentic-ai")).rejects.toThrow("boom");
  });
});

describe("mayDiscloseSeriesLive", () => {
  it("discloses a DB-live non-stealth row with NO mirror short-circuit", async () => {
    // `brand-new-course` is deliberately outside the static snapshot — a
    // /admin launch that was never mirrored must still be disclosable (t_47183b5b).
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "free",
    });
    expect(await mayDiscloseSeriesLive("brand-new-course")).toBe(true);
  });

  it("refuses a stealth row even when the snapshot would list it", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({
      status: "live",
      access_model: "granted",
    });
    expect(await mayDiscloseSeriesLive("agentic-ai")).toBe(false);
  });

  it("falls back to the snapshot on a credential outage", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    expect(await mayDiscloseSeriesLive("agentic-ai")).toBe(true);
    expect(await mayDiscloseSeriesLive("hermes-consultant")).toBe(false);
  });
});
