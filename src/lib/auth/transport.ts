/**
 * src/lib/auth/transport.ts — environment-aware transport rules for the
 * Managed Better Auth (Neon Auth) SDK.
 *
 * Both rules exist because the SDK's defaults are production-https-only and
 * break anywhere else (QA follow-up t_ab6c1cb6 on the R2-1 review):
 *
 *  1. ORIGIN — the SDK's Next adapter forwards `Origin:` upstream from the
 *     incoming request and only falls back to `Referer`. A non-browser caller
 *     (curl, native/mobile, server-to-server) sends neither, so the SDK
 *     forwards `Origin: ""` and Neon Auth answers
 *     `403 MISSING_OR_NULL_ORIGIN`, which every route then reports as a generic
 *     failure. `resolveRequestOrigin()` synthesises the canonical site origin
 *     for those callers instead of forwarding an empty header.
 *
 *  2. COOKIES — the SDK always writes `secure: true` on `__Secure-neon-auth.*`
 *     cookies. Over plain http on a non-loopback host (e.g. an http preview or
 *     a LAN staging box at `http://192.168.1.20:3000`) browsers drop them, so
 *     sign-in answers 200 but the session never persists and every later page
 *     renders as a guest. `toStorageCookieName()`/`adaptSetCookieHeader()`
 *     keep the `__Secure-` prefix + `Secure` flag on https (and on loopback,
 *     which browsers treat as a secure context) and fall back to the plain
 *     `neon-auth.*` names without `Secure` everywhere else. Cookies are
 *     translated back to the SDK's names on the way upstream, so the auth
 *     backend only ever sees the names it expects.
 *
 * Deliberately dependency-free (only `siteConfig`) so it can be imported from
 * the proxy, route handlers and unit tests without pulling in the SDK or
 * `next/headers`.
 */
import { siteConfig } from "@/lib/seo";

/* ------------------------------------------------------------------ */
/*  Cookie names                                                       */
/* ------------------------------------------------------------------ */

/**
 * The SDK's prefixed cookie namespace. Mirrored here (not imported) so this
 * module stays SDK-free; `transport.test.ts` pins the literals against the
 * SDK's exported constants so they cannot drift.
 */
export const SECURE_COOKIE_PREFIX = "__Secure-neon-auth";
/** Prefix these cookies carry when they are written over plain http. */
export const PLAIN_COOKIE_PREFIX = "neon-auth";

export const SECURE_SESSION_COOKIE_NAME = `${SECURE_COOKIE_PREFIX}.session_token`;
export const PLAIN_SESSION_COOKIE_NAME = `${PLAIN_COOKIE_PREFIX}.session_token`;

/** Every name the session token can legitimately be stored under. */
export const SESSION_COOKIE_NAMES: readonly string[] = [
  SECURE_SESSION_COOKIE_NAME,
  PLAIN_SESSION_COOKIE_NAME,
];

/* ------------------------------------------------------------------ */
/*  Origin                                                             */
/* ------------------------------------------------------------------ */

/** Minimal header bag — `Headers`, a `ReadonlyHeaders`, or a stub. */
export interface HeaderReader {
  get(name: string): string | null;
}

const ABSOLUTE_URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * `https://host[:port]` for an absolute http(s) URL (paths and query are
 * dropped), otherwise `null`. Opaque values such as the literal `null` a
 * sandboxed iframe sends are rejected.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !ABSOLUTE_URL_RE.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The origin this deployment considers canonical: `NEXT_PUBLIC_SITE_URL` when
 * it is a usable absolute origin, else the code-level `siteConfig.url`
 * (ADR-PWR-1: auth-email links never derive from the request host).
 */
export function canonicalOrigin(): string {
  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? siteConfig.url;
}

/** Origin embedded in a `Referer`, or `null`. */
function originFromReferer(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origin to send upstream as `Origin:` and to build redirect URLs from.
 *
 * `Origin` → `Referer` → canonical site origin. Never an empty string: Neon
 * Auth rejects a missing/null Origin with `MISSING_OR_NULL_ORIGIN`, which is
 * what broke every non-browser client.
 *
 * A present `Origin` is trusted only in the sense that the SDK needs *an*
 * origin; `checkOrigin()` (src/lib/api-security.ts) is still what decides
 * whether the caller is first-party — it runs first on every mutating route.
 */
export function resolveRequestOrigin(headers: HeaderReader): string {
  return (
    normalizeOrigin(headers.get("origin")) ??
    originFromReferer(headers.get("referer")) ??
    canonicalOrigin()
  );
}

/* ------------------------------------------------------------------ */
/*  Transport security                                                 */
/* ------------------------------------------------------------------ */

/** True for `localhost`, `127.0.0.0/8`, `[::1]` and `*.localhost[:port]`. */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function protocolOf(headers: HeaderReader): "http" | "https" | null {
  const forwarded = (headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return "https";
  if (forwarded === "http") return "http";

  const origin = normalizeOrigin(headers.get("origin"));
  if (origin) return origin.startsWith("https://") ? "https" : "http";

  const referer = originFromReferer(headers.get("referer"));
  if (referer) return referer.startsWith("https://") ? "https" : "http";

  return null;
}

/**
 * Whether this request arrived over TLS, i.e. whether `Secure` + `__Secure-`
 * cookies can be used.
 *
 * Precedence: explicit `AUTH_COOKIE_SECURE` override → `x-forwarded-proto`
 * (Vercel and every sane reverse proxy set it) → the scheme of the incoming
 * Origin/Referer → loopback (browsers accept `Secure` cookies on localhost) →
 * the canonical origin's scheme when there is not even a Host header.
 *
 * A request that is admitted by NO signal (a LAN ip:port over plain http with
 * no proxy headers) is treated as http, because writing a cookie the browser
 * will discard is a worse failure than losing the `__Secure-` hardening on a
 * deployment that has no TLS. https deployments keep the hardened form.
 */
export function isSecureRequest(headers: HeaderReader): boolean {
  const override = (process.env.AUTH_COOKIE_SECURE ?? "").trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;

  const protocol = protocolOf(headers);
  if (protocol) return protocol === "https";

  const host = headers.get("host");
  if (host) return isLoopbackHost(host);

  return canonicalOrigin().startsWith("https://");
}

/* ------------------------------------------------------------------ */
/*  Cookie name translation                                            */
/* ------------------------------------------------------------------ */

/**
 * Cookie name to store on the client for the given transport.
 *
 * `secure` → the SDK's `__Secure-neon-auth.*` names, `insecure` → the plain
 * `neon-auth.*` names (a `__Secure-` cookie is rejected by the browser
 * unless it also carries `Secure`). Mapping is idempotent in both
 * directions, so it is safe to apply to an already-mapped name.
 */
export function toStorageCookieName(name: string, secure: boolean): string {
  const bare = name.trim();
  if (secure) {
    return bare.startsWith(`${PLAIN_COOKIE_PREFIX}.`)
      ? `${SECURE_COOKIE_PREFIX}${bare.slice(PLAIN_COOKIE_PREFIX.length)}`
      : bare;
  }
  return bare.startsWith(SECURE_COOKIE_PREFIX)
    ? `${PLAIN_COOKIE_PREFIX}${bare.slice(SECURE_COOKIE_PREFIX.length)}`
    : bare;
}

/** Cookie name the SDK/auth backend expects on the wire. */
export function toUpstreamCookieName(name: string): string {
  return toStorageCookieName(name, true);
}

/**
 * Re-serialise an inbound `Cookie:` header with the SDK's names, keeping only
 * Neon Auth cookies (the SDK forwards nothing else and rejects the rest).
 * Returns `""` when the request carries no auth cookie.
 */
export function authCookiesForUpstream(cookieHeader: string | null | undefined): string {
  if (!cookieHeader) return "";
  const pairs: string[] = [];
  for (const raw of cookieHeader.split(";")) {
    const entry = raw.trim();
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const name = entry.slice(0, eq).trim();
    const wireName = toUpstreamCookieName(name);
    if (!wireName.startsWith(SECURE_COOKIE_PREFIX)) continue;
    pairs.push(`${wireName}${entry.slice(eq)}`);
  }
  return pairs.join("; ");
}

/** True when the cookie header carries a session token under either name. */
export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return SESSION_COOKIE_NAMES.some((name) => cookieHeader.includes(name));
}

/**
 * Rewrite one `Set-Cookie` header for the current transport: drop the
 * `__Secure-` prefix and the `Secure`/`Partitioned` attributes when the
 * response is served over plain http.
 */
export function adaptSetCookieHeader(setCookie: string, secure: boolean): string {
  const trimmed = setCookie.trim();
  const semi = trimmed.indexOf(";");
  const pair = semi === -1 ? trimmed : trimmed.slice(0, semi);
  let attributes = semi === -1 ? "" : trimmed.slice(semi);

  const eq = pair.indexOf("=");
  if (eq <= 0) return trimmed;
  const name = pair.slice(0, eq).trim();
  const storageName = toStorageCookieName(name, secure);

  if (!secure) {
    attributes = attributes
      .replace(/;\s*Secure\b/gi, "")
      .replace(/;\s*Partitioned\b/gi, "");
  }
  return `${storageName}${pair.slice(eq)}${attributes}`;
}

/** `adaptSetCookieHeader` over every `Set-Cookie` on a response. */
export function adaptSetCookieHeaders(headers: Headers, secure: boolean): string[] {
  return headers.getSetCookie().map((value) => adaptSetCookieHeader(value, secure));
}

/** Copy a response, replacing its `Set-Cookie` headers with adapted ones. */
export function adaptResponseCookies(response: Response, secure: boolean): Response {
  if (response.headers.getSetCookie().length === 0) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of adaptSetCookieHeaders(response.headers, secure)) {
    headers.append("set-cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Request headers to hand to the SDK proxy: a synthesised `Origin` (never
 * empty) and the auth cookies under their SDK names. Everything else is
 * copied through untouched.
 */
export function forwardableAuthHeaders(headers: Headers): Headers {
  const forwarded = new Headers(headers);
  forwarded.set("origin", resolveRequestOrigin(headers));

  const cookies = authCookiesForUpstream(headers.get("cookie"));
  if (cookies) forwarded.set("cookie", cookies);
  else forwarded.delete("cookie");

  return forwarded;
}
