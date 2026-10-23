/**
 * transport.test.ts — origin synthesis + environment-aware cookie transport
 * for the Managed Better Auth SDK (QA F1/F2, t_ab6c1cb6).
 *
 * These are the two defaults that used to be hardcoded for production https:
 *   - a request with no `Origin` (curl / native / server-to-server) forwarded
 *     an empty Origin upstream → Neon Auth `403 MISSING_OR_NULL_ORIGIN`;
 *   - session cookies were always `__Secure-` + `Secure`, so a browser on
 *     plain http (LAN staging, http preview) dropped them and every page
 *     rendered as a guest.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  NEON_AUTH_COOKIE_PREFIX,
  NEON_AUTH_SESSION_COOKIE_NAME,
} from "@neondatabase/auth/server";
import {
  PLAIN_COOKIE_PREFIX,
  PLAIN_SESSION_COOKIE_NAME,
  SECURE_COOKIE_PREFIX,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAMES,
  adaptSetCookieHeader,
  adaptSetCookieHeaders,
  adaptResponseCookies,
  authCookiesForUpstream,
  canonicalOrigin,
  forwardableAuthHeaders,
  hasSessionCookie,
  isLoopbackHost,
  isSecureRequest,
  normalizeOrigin,
  resolveRequestOrigin,
  toStorageCookieName,
  toUpstreamCookieName,
} from "./transport";

function headers(init: Record<string, string> = {}): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(init)) h.set(k, v);
  return h;
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.AUTH_COOKIE_SECURE;
});

describe("cookie name literals", () => {
  it("match the SDK's exported names so the mirror cannot drift", () => {
    expect(SECURE_COOKIE_PREFIX).toBe(NEON_AUTH_COOKIE_PREFIX);
    expect(SECURE_SESSION_COOKIE_NAME).toBe(NEON_AUTH_SESSION_COOKIE_NAME);
    expect(PLAIN_COOKIE_PREFIX).toBe("neon-auth");
    expect(PLAIN_SESSION_COOKIE_NAME).toBe("neon-auth.session_token");
    expect(SESSION_COOKIE_NAMES).toEqual([
      "__Secure-neon-auth.session_token",
      "neon-auth.session_token",
    ]);
  });
});

describe("normalizeOrigin", () => {
  it("keeps absolute http(s) origins and drops paths", () => {
    expect(normalizeOrigin("https://adroit.io")).toBe("https://adroit.io");
    expect(normalizeOrigin("https://adroit.io/blog/x?y=1")).toBe("https://adroit.io");
    expect(normalizeOrigin(" http://192.168.1.20:3111 ")).toBe("http://192.168.1.20:3111");
  });

  it("rejects non-origin / opaque values", () => {
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("adroit.io")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
  });
});

describe("canonicalOrigin / resolveRequestOrigin", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, else the code-level site origin", () => {
    expect(canonicalOrigin()).toBe("https://adroit.io");
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.adroit.io";
    expect(canonicalOrigin()).toBe("https://staging.adroit.io");
  });

  it("echoes a valid Origin header", () => {
    expect(
      resolveRequestOrigin(headers({ origin: "http://192.168.1.20:3111" })),
    ).toBe("http://192.168.1.20:3111");
  });

  it("falls back to the Referer origin when Origin is absent", () => {
    expect(
      resolveRequestOrigin(headers({ referer: "https://adroit.io/atlas?x=1" })),
    ).toBe("https://adroit.io");
  });

  it("NEVER returns an empty origin — the F1 regression", () => {
    // curl / native / server-to-server: no Origin, no Referer. The SDK used to
    // forward "" here and Neon Auth answered MISSING_OR_NULL_ORIGIN.
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.dev";
    expect(resolveRequestOrigin(headers())).toBe("https://preview.example.dev");
    expect(resolveRequestOrigin(headers({ origin: "", referer: "" }))).toBe(
      "https://preview.example.dev",
    );
  });

  it("ignores an unusable Origin (opaque `null`) and uses the canonical one", () => {
    expect(resolveRequestOrigin(headers({ origin: "null" }))).toBe("https://adroit.io");
  });
});

describe("isSecureRequest", () => {
  it("trusts x-forwarded-proto first (Vercel / reverse proxies)", () => {
    expect(isSecureRequest(headers({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(
      isSecureRequest(headers({ "x-forwarded-proto": "https,http", host: "adroit.io" })),
    ).toBe(true);
    expect(
      isSecureRequest(
        headers({ "x-forwarded-proto": "http", origin: "https://adroit.io" }),
      ),
    ).toBe(false);
  });

  it("uses the Origin scheme when there is no proxy header", () => {
    expect(isSecureRequest(headers({ origin: "https://adroit.io" }))).toBe(true);
    expect(isSecureRequest(headers({ origin: "http://192.168.1.20:3111" }))).toBe(false);
  });

  it("treats loopback as secure (browsers accept Secure cookies there)", () => {
    expect(isSecureRequest(headers({ host: "localhost:3000" }))).toBe(true);
    expect(isSecureRequest(headers({ host: "127.0.0.1:3111" }))).toBe(true);
    expect(isSecureRequest(headers({ host: "[::1]:3111" }))).toBe(true);
  });

  it("treats plain http on a LAN host as insecure — the F2 regression", () => {
    // `next start` on a LAN ip: no proxy headers, browser drops Secure cookies.
    expect(isSecureRequest(headers({ host: "192.168.1.20:3111" }))).toBe(false);
  });

  it("honours the AUTH_COOKIE_SECURE override", () => {
    process.env.AUTH_COOKIE_SECURE = "true";
    expect(isSecureRequest(headers({ host: "192.168.1.20:3111" }))).toBe(true);
    process.env.AUTH_COOKIE_SECURE = "false";
    expect(isSecureRequest(headers({ "x-forwarded-proto": "https" }))).toBe(false);
  });
});

describe("isLoopbackHost", () => {
  it("recognises loopback forms", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1:3111", "[::1]:1", "app.localhost"]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of ["192.168.1.20:3111", "adroit.io", "10.0.0.1", ""]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });
});

describe("cookie name translation", () => {
  it("round-trips between the two namespaces, idempotently", () => {
    expect(toStorageCookieName("__Secure-neon-auth.session_token", false)).toBe(
      "neon-auth.session_token",
    );
    expect(toStorageCookieName("neon-auth.session_token", true)).toBe(
      "__Secure-neon-auth.session_token",
    );
    expect(toStorageCookieName("__Secure-neon-auth.session_token", true)).toBe(
      "__Secure-neon-auth.session_token",
    );
    expect(toStorageCookieName("neon-auth.session_token", false)).toBe(
      "neon-auth.session_token",
    );
    // Non-auth cookies are left alone.
    expect(toStorageCookieName("adroit_cookie_consent", false)).toBe(
      "adroit_cookie_consent",
    );
  });

  it("on a secure request maps auth cookies to wire names and drops foreign cookies", () => {
    expect(
      authCookiesForUpstream(
        "adroit_cookie_consent=granted; __Secure-neon-auth.session_token=tok; __Secure-neon-auth.local.session_data=data; other=1",
        true,
      ),
    ).toBe(
      "__Secure-neon-auth.session_token=tok; __Secure-neon-auth.local.session_data=data",
    );
    expect(authCookiesForUpstream(null, true)).toBe("");
    expect(authCookiesForUpstream("nothing=here", true)).toBe("");
  });

  it("on https drops a planted plain neon-auth.* cookie instead of up-converting it (M2, CWE-384)", () => {
    // The proven exploit: a sibling subdomain plants the plain parent-domain
    // cookie alongside the victim's real secure cookie.
    expect(
      authCookiesForUpstream(
        "neon-auth.session_token=ATTACKER; __Secure-neon-auth.session_token=VICTIM",
        true,
      ),
    ).toBe("__Secure-neon-auth.session_token=VICTIM");

    // And the plain name alone is not a session on https at all.
    expect(
      authCookiesForUpstream("neon-auth.session_token=ATTACKER", true),
    ).toBe("");
  });

  it("on plain http accepts only plain neon-auth.* and drops __Secure-* names", () => {
    expect(
      authCookiesForUpstream(
        "neon-auth.session_token=CLIENT; __Secure-neon-auth.session_token=PLANTED",
        false,
      ),
    ).toBe("__Secure-neon-auth.session_token=CLIENT");

    // A `__Secure-` name cannot exist over plain http; ignore it entirely.
    expect(
      authCookiesForUpstream("__Secure-neon-auth.session_token=VICTIM", false),
    ).toBe("");
  });

  it("detects a session token only under the name valid for the transport", () => {
    expect(hasSessionCookie("__Secure-neon-auth.session_token=a", true)).toBe(true);
    expect(hasSessionCookie("neon-auth.session_token=a", true)).toBe(false);
    expect(hasSessionCookie("neon-auth.session_token=a", false)).toBe(true);
    expect(hasSessionCookie("__Secure-neon-auth.session_token=a", false)).toBe(false);
    expect(hasSessionCookie("adroit_cookie_consent=granted", true)).toBe(false);
    expect(hasSessionCookie(null, true)).toBe(false);
  });

  it("keeps the prefixed+Secure form on secure transports", () => {
    const raw =
      "__Secure-neon-auth.session_token=abc; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=lax";
    expect(adaptSetCookieHeader(raw, true)).toBe(raw);
  });

  it("degrades to the plain name without Secure on http", () => {
    const raw =
      "__Secure-neon-auth.session_token=abc; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=lax";
    const adapted = adaptSetCookieHeader(raw, false);
    expect(adapted).toBe(
      "neon-auth.session_token=abc; Path=/; Max-Age=604800; HttpOnly; SameSite=lax",
    );
    expect(adapted).not.toContain("Secure");
  });

  it("drops Partitioned too (it requires Secure)", () => {
    const adapted = adaptSetCookieHeader(
      "__Secure-neon-auth.local.session_data=v; Path=/; Secure; Partitioned",
      false,
    );
    expect(adapted).toBe("neon-auth.local.session_data=v; Path=/");
  });

  it("adapts every Set-Cookie on a response without losing the body", async () => {
    const upstream = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie":
          "__Secure-neon-auth.session_token=abc; Path=/; Secure; HttpOnly",
      },
    });
    const adapted = adaptResponseCookies(upstream, false);
    expect(adapted.status).toBe(200);
    expect(adapted.headers.get("content-type")).toBe("application/json");
    expect(await adapted.json()).toEqual({ ok: true });
    expect(adapted.headers.getSetCookie()).toEqual([
      "neon-auth.session_token=abc; Path=/; HttpOnly",
    ]);

    // Secure transport → untouched, and a cookie-less response passes through
    // as the same object (no needless clone).
    const secureRes = new Response(null, {
      headers: { "set-cookie": "__Secure-neon-auth.session_token=abc; Path=/; Secure" },
    });
    expect(adaptResponseCookies(secureRes, true).headers.getSetCookie()).toEqual([
      "__Secure-neon-auth.session_token=abc; Path=/; Secure",
    ]);
    const plain = new Response("x");
    expect(adaptResponseCookies(plain, false)).toBe(plain);
  });

  it("adaptSetCookieHeaders maps multiple headers in order", () => {
    const h = headers();
    h.append("set-cookie", "__Secure-neon-auth.session_token=a; Path=/; Secure");
    h.append("set-cookie", "__Secure-neon-auth.local.session_data=b; Path=/; Secure");
    expect(adaptSetCookieHeaders(h, false)).toEqual([
      "neon-auth.session_token=a; Path=/",
      "neon-auth.local.session_data=b; Path=/",
    ]);
  });
});

describe("forwardableAuthHeaders", () => {
  it("synthesises a non-empty Origin and re-prefixes auth cookies", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://adroit.io";
    const forwarded = forwardableAuthHeaders(
      headers({ host: "internal:8080", cookie: "neon-auth.session_token=tok; other=1" }),
    );
    expect(forwarded.get("origin")).toBe("https://adroit.io");
    expect(forwarded.get("cookie")).toBe("__Secure-neon-auth.session_token=tok");
  });

  it("keeps a caller-supplied Origin (browser POST)", () => {
    const forwarded = forwardableAuthHeaders(
      headers({ origin: "http://192.168.1.20:3111", host: "192.168.1.20:3111" }),
    );
    expect(forwarded.get("origin")).toBe("http://192.168.1.20:3111");
    // No auth cookie → header removed rather than forwarded empty.
    expect(forwarded.get("cookie")).toBeNull();
  });

  it("does not mutate the caller's headers", () => {
    const original = headers({ host: "adroit.io" });
    const forwarded = forwardableAuthHeaders(original);
    expect(original.get("origin")).toBeNull();
    expect(forwarded.get("origin")).toBe("https://adroit.io");
  });
});

describe("toUpstreamCookieName", () => {
  it("always yields the SDK's prefixed name", () => {
    expect(toUpstreamCookieName("neon-auth.session_token")).toBe(
      "__Secure-neon-auth.session_token",
    );
    expect(toUpstreamCookieName("__Secure-neon-auth.session_token")).toBe(
      "__Secure-neon-auth.session_token",
    );
  });
});
