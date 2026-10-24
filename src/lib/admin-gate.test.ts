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
 *
 * Also covers the observability follow-up (t_a2660e8c): because the deny is
 * uniform by design, the sentinel branch is the only place a lockout is visible,
 * so it must emit ONE throttled server-side signal — and that line must never
 * carry the user id, the token, or the raw error message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import type { MockInstance } from "vitest";

let warnSpy: MockInstance;

beforeEach(() => {
  isAdminMock.mockReset();
  getAccessUserIdMock.mockReset();
  getAccessUserIdMock.mockResolvedValue("user-1");
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
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

/**
 * Observability follow-up (t_a2660e8c / SEC-C1 / P1 / QA-L3). The degrade to a
 * uniform deny is intentional, so a silent sentinel branch makes a token-route
 * lockout indistinguishable from ordinary "not an admin" traffic. These tests
 * pin the signal AND its redaction: no user id, no token, no raw error message.
 */
describe("degraded admin deny raises one bounded, redacted server-side signal", () => {
  /** Fresh module per test: the throttle window is process state. */
  async function loadAdmin() {
    vi.resetModules();
    return import("./admin");
  }

  function emittedLines(): string[] {
    return warnSpy.mock.calls.map((call) => call.map(String).join(" "));
  }

  it("a sentinel deny emits exactly one log line, naming the degrade reason", async () => {
    const { requireAdminApi } = await loadAdmin();
    isAdminMock.mockRejectedValue(new DbTokenUnavailableError("/token/anonymous"));

    const gate = await requireAdminApi();

    // Deny shape unchanged (assertion repeated here so a signal cannot alter it).
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      expect(await gate.response.json()).toEqual({ error: "Forbidden" });
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [line] = emittedLines();
    expect(line).toContain("[admin-gate] degraded-deny");
    expect(line).toContain("reason=token-unavailable");
    expect(line).toContain("code=TOKEN_UNAVAILABLE");
  });

  it("stays bounded under sustained load, while the hit counter keeps climbing", async () => {
    const { requireAdminApi } = await loadAdmin();
    isAdminMock.mockRejectedValue(new DbTokenUnavailableError("/token/anonymous"));

    for (let i = 0; i < 50; i += 1) {
      await requireAdminApi();
    }

    // 50 degraded denies across the three guards → one line, not 50.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [line] = emittedLines();
    // The aggregate count is the useful signal under throttle; it is not PII.
    expect(line).toMatch(/hits=\d+/);
  });

  it("is throttled per window and re-emits once the window elapses", async () => {
    const { signalDegradedAdminDeny, DEGRADED_ADMIN_DENY_LOG_INTERVAL_MS } =
      await loadAdmin();

    expect(DEGRADED_ADMIN_DENY_LOG_INTERVAL_MS).toBe(60_000);
    expect(signalDegradedAdminDeny(1_000)).toBe(true);
    expect(signalDegradedAdminDeny(1_000 + 30_000)).toBe(false);
    expect(signalDegradedAdminDeny(1_000 + 59_999)).toBe(false);
    expect(signalDegradedAdminDeny(1_000 + 60_000)).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    // The second line carries the aggregate count (4 hits, 2 emitted).
    expect(emittedLines()[1]).toContain("hits=4");
  });

  it("never logs the user id, the token path, or the raw error message", async () => {
    const { requireAdminApi, requireAdminPage, isCurrentUserAdmin } = await loadAdmin();
    // Sentinel recognised by shape, carrying exactly the payloads that must not leak.
    isAdminMock.mockRejectedValue({
      name: "DbTokenUnavailableError",
      code: "TOKEN_UNAVAILABLE",
      correlation: "r2-5-token-unavailable",
      message: "RAW-ERROR-MESSAGE-should-not-be-logged",
      tokenPath: "/token/anonymous",
      userId: "user-1",
    });

    await requireAdminApi();
    await isCurrentUserAdmin();
    await requireAdminPage();

    const emitted = emittedLines().join("\n");
    expect(emitted).not.toContain("user-1");
    expect(emitted).not.toContain("/token/anonymous");
    expect(emitted).not.toContain("RAW-ERROR-MESSAGE-should-not-be-logged");
    expect(emitted).not.toContain("Neon Data API token is unavailable");
    expect(emitted).not.toContain("tokenPath");
  });

  it("does NOT signal on a non-sentinel error (it still propagates)", async () => {
    const { requireAdminApi } = await loadAdmin();
    const boom = new Error("connection refused");
    isAdminMock.mockRejectedValue(boom);

    await expect(requireAdminApi()).rejects.toBe(boom);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT signal for an ordinary non-admin or a guest", async () => {
    const { requireAdminApi, isCurrentUserAdmin, requireAdminPage } = await loadAdmin();

    isAdminMock.mockResolvedValue(false);
    expect((await requireAdminApi()).ok).toBe(false);
    await expect(isCurrentUserAdmin()).resolves.toBe(false);
    await expect(requireAdminPage()).resolves.toBeNull();

    getAccessUserIdMock.mockResolvedValue(null);
    expect((await requireAdminApi()).ok).toBe(false);
    await expect(isCurrentUserAdmin()).resolves.toBe(false);
    await expect(requireAdminPage()).resolves.toBeNull();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
