/**
 * admin-gate.test.ts — the admin gate's handling of the R2-5 "no Data API
 * token" sentinel (t_cf1e430f, CWE-755).
 *
 * `requireAdminApi()` / `isCurrentUserAdmin()` / `requireAdminPage()` all read
 * the role through the access seam. Under a token-route 429 the seam cannot read
 * the role and throws `DbTokenUnavailableError`; letting it escape turns a
 * routine lockout into a 5xx on every admin surface. The gate must degrade the
 * CLASSIFIED sentinel to its uniform deny, and must keep propagating anything
 * else so a real fault is never masked as "forbidden".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { isAdminMock, getAccessUserIdMock } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  getAccessUserIdMock: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  accessSeam: { isAdmin: isAdminMock },
  getAccessUserId: getAccessUserIdMock,
}));

import { DbTokenUnavailableError } from "@/lib/db/degraded-client";
import {
  isCurrentUserAdmin,
  requireAdminApi,
  requireAdminPage,
} from "./admin";

beforeEach(() => {
  isAdminMock.mockReset();
  getAccessUserIdMock.mockReset();
  getAccessUserIdMock.mockResolvedValue("user-1");
});

describe("admin gate under a token-route lockout (R2-5 sentinel)", () => {
  it("requireAdminApi answers the uniform 403 instead of throwing", async () => {
    isAdminMock.mockRejectedValue(new DbTokenUnavailableError("/token/anonymous"));

    const gate = await requireAdminApi();

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      expect(await gate.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("isCurrentUserAdmin answers false (nav stays hidden, no throw)", async () => {
    isAdminMock.mockRejectedValue(new DbTokenUnavailableError("/token/anonymous"));

    await expect(isCurrentUserAdmin()).resolves.toBe(false);
  });

  it("requireAdminPage answers null so the caller renders 404, not 500", async () => {
    isAdminMock.mockRejectedValue(new DbTokenUnavailableError("/token/anonymous"));

    await expect(requireAdminPage()).resolves.toBeNull();
  });

  it("recognises the sentinel by shape, not only by class identity", async () => {
    // Same code/correlation as a serialized or cross-realm copy would carry.
    isAdminMock.mockRejectedValue({
      name: "DbTokenUnavailableError",
      code: "TOKEN_UNAVAILABLE",
      correlation: "r2-5-token-unavailable",
    });

    const gate = await requireAdminApi();

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("still propagates a genuine (non-sentinel) failure — not a blanket catch", async () => {
    const boom = new Error("connection refused");
    isAdminMock.mockRejectedValue(boom);

    await expect(requireAdminApi()).rejects.toBe(boom);
    await expect(isCurrentUserAdmin()).rejects.toBe(boom);
    await expect(requireAdminPage()).rejects.toBe(boom);
  });

  it("lets a real admin through", async () => {
    isAdminMock.mockResolvedValue(true);

    await expect(requireAdminApi()).resolves.toEqual({ ok: true, userId: "user-1" });
    await expect(isCurrentUserAdmin()).resolves.toBe(true);
    await expect(requireAdminPage()).resolves.toEqual({ userId: "user-1" });
  });

  it("guests never reach the seam", async () => {
    getAccessUserIdMock.mockResolvedValue(null);

    await expect(isCurrentUserAdmin()).resolves.toBe(false);
    await expect(requireAdminPage()).resolves.toBeNull();
    const gate = await requireAdminApi();
    expect(gate.ok).toBe(false);
    expect(isAdminMock).not.toHaveBeenCalled();
  });
});
