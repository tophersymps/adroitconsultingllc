/**
 * src/lib/atlas-disclosure.test.ts — the DB half of the disclosure predicate
 * (t_b4c0da5f, MEDIUM, CWE-200).
 *
 * `isSeriesDbLive()` must answer three ways: live row → true, non-live or
 * absent row → false, credential outage → null (caller falls back to the static
 * mirror). Any OTHER loader error must propagate — it is a bug, not an outage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getCourseRowBySlug: vi.fn() },
}));

vi.mock("@/lib/access", () => ({
  getCourseRowBySlug: mocks.getCourseRowBySlug,
}));

import { isSeriesDbLive } from "@/lib/atlas-disclosure";
import { DbTokenUnavailableError } from "@/lib/db/degraded-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSeriesDbLive", () => {
  it("returns true for a live courses row", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "live" });
    expect(await isSeriesDbLive("agentic-ai")).toBe(true);
  });

  it("returns false for a delisted (pending/archived) row", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "pending" });
    expect(await isSeriesDbLive("agentic-ai")).toBe(false);
    mocks.getCourseRowBySlug.mockResolvedValue({ status: "archived" });
    expect(await isSeriesDbLive("agentic-ai")).toBe(false);
  });

  it("returns false when there is no courses row at all (stealth)", async () => {
    mocks.getCourseRowBySlug.mockResolvedValue(null);
    expect(await isSeriesDbLive("hermes-consultant")).toBe(false);
  });

  it("returns null on a credential outage so the caller falls back to the mirror", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(
      new DbTokenUnavailableError("/token/anonymous"),
    );
    expect(await isSeriesDbLive("agentic-ai")).toBeNull();
  });

  it("propagates an unrelated loader failure instead of degrading it", async () => {
    mocks.getCourseRowBySlug.mockRejectedValue(new Error("boom"));
    await expect(isSeriesDbLive("agentic-ai")).rejects.toThrow("boom");
  });
});
