/**
 * route.test.ts — GET /auth/callback (Managed Better Auth landing shim).
 *
 * Neon R2-1: there is no code exchange any more (Better Auth's emailed token
 * IS the credential). The behaviours that must survive:
 *   - `?token=…` is forwarded to the reset page, preserving the token
 *   - a dead link (`error=` / legacy `code=`) lands on the "expired" state
 *   - nothing usable → "invalid"
 *   - `next` is sanitized (CWE-601): an external URL cannot be produced
 *   - never a 500
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/auth/callback${query}`);
}

function location(res: Response): URL {
  return new URL(res.headers.get("location")!);
}

describe("GET /auth/callback (Neon Auth shim)", () => {
  it("forwards a valid token to the reset page", async () => {
    const res = await GET(req("?token=abc123"));
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/reset-password");
    expect(location(res).searchParams.get("token")).toBe("abc123");
  });

  it("honours a sanitized next path", async () => {
    const res = await GET(req("?token=abc123&next=%2Fsettings"));
    expect(location(res).pathname).toBe("/settings");
    expect(location(res).searchParams.get("token")).toBe("abc123");
  });

  it("sanitizes an external next to the reset page (CWE-601, AC-2.3)", async () => {
    const res = await GET(
      req("?token=abc123&next=https%3A%2F%2Fevil.example%2Fpwn"),
    );
    const url = location(res);
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/reset-password");
  });

  it("maps an upstream error to ?error=expired (ADR-PWR-3)", async () => {
    const res = await GET(req("?error=INVALID_TOKEN"));
    expect(location(res).pathname).toBe("/reset-password");
    expect(location(res).searchParams.get("error")).toBe("expired");
  });

  it("maps a legacy GoTrue code (no token) to ?error=expired", async () => {
    const res = await GET(req("?code=old-gotrue-code"));
    expect(location(res).searchParams.get("error")).toBe("expired");
  });

  it("maps a missing token to ?error=invalid (AC-2.5)", async () => {
    const res = await GET(req(""));
    expect(location(res).searchParams.get("error")).toBe("invalid");
  });
});
