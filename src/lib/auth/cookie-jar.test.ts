/**
 * cookie-jar.test.ts — deterministic session-cookie writes (t_ab6c1cb6 F2).
 *
 * The SDK's adapter writes cookies through `cookies().set()`, which inside a
 * route handler is silently dropped (sign-in answered 200 with no Set-Cookie
 * at all). The jar captures the writes and replays them onto the response the
 * route actually returns, so the assertions here are about the exact header.
 */
import { describe, it, expect } from "vitest";
import { recordAuthCookie, serializeAuthCookie, withAuthCookies } from "./cookie-jar";

describe("withAuthCookies", () => {
  it("replays recorded cookies as Set-Cookie headers on the handler response", async () => {
    const response = await withAuthCookies(async () => {
      recordAuthCookie({
        name: "neon-auth.session_token",
        value: "tok",
        options: { path: "/", maxAge: 604800, httpOnly: true, sameSite: "lax" },
      });
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.getSetCookie()).toEqual([
      "neon-auth.session_token=tok; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax",
    ]);
  });

  it("carries the hardened attributes over https", async () => {
    const response = await withAuthCookies(async () => {
      recordAuthCookie({
        name: "__Secure-neon-auth.session_token",
        value: "tok",
        options: { path: "/", maxAge: 60, httpOnly: true, secure: true, sameSite: "lax" },
      });
      return new Response(null, { status: 204 });
    });

    expect(response.headers.getSetCookie()).toEqual([
      "__Secure-neon-auth.session_token=tok; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("keeps concurrent requests isolated", async () => {
    const [a, b] = await Promise.all([
      withAuthCookies(async () => {
        recordAuthCookie({ name: "a", value: "1", options: { path: "/" } });
        return new Response(null);
      }),
      withAuthCookies(async () => {
        recordAuthCookie({ name: "b", value: "2", options: { path: "/" } });
        return new Response(null);
      }),
    ]);

    expect(a.headers.getSetCookie()).toEqual(["a=1; Path=/"]);
    expect(b.headers.getSetCookie()).toEqual(["b=2; Path=/"]);
  });

  it("is a no-op outside a jar (server components cannot set cookies)", () => {
    expect(() =>
      recordAuthCookie({ name: "x", value: "1", options: { path: "/" } }),
    ).not.toThrow();
  });

  it("leaves a cookie-less response untouched", async () => {
    const res = await withAuthCookies(async () => new Response("hi"));
    expect(res.headers.getSetCookie()).toEqual([]);
    await expect(res.text()).resolves.toBe("hi");
  });

  it("encodes cookie values (session tokens are base64)", () => {
    expect(
      serializeAuthCookie({
        name: "neon-auth.session_token",
        value: "a+b/c=",
        options: { path: "/", secure: false },
      }),
    ).toBe("neon-auth.session_token=a%2Bb%2Fc%3D; Path=/");
  });

  it("serialises expiry / domain attributes when present", () => {
    const expires = new Date(Date.UTC(2026, 9, 24, 0, 0, 0));
    expect(
      serializeAuthCookie({
        name: "n",
        value: "v",
        options: { path: "/", domain: ".adroit.io", expires, sameSite: "strict" },
      }),
    ).toBe("n=v; Path=/; Domain=.adroit.io; Expires=Sat, 24 Oct 2026 00:00:00 GMT; SameSite=Strict");
  });
});
