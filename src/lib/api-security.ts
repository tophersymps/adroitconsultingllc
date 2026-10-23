/**
 * Shared API security helpers for progress routes.
 *
 * Aggregates input validation, rate limiting, origin checks, and
 * standardised error handling so every POST route applies the same
 * defences (F2, F3, F5, F6 from security audit t_3bbee885).
 */
import { NextRequest } from "next/server";

/* ------------------------------------------------------------------ */
/*  Input validation (F2)                                              */
/* ------------------------------------------------------------------ */

const SLUG_MAX = 200;
// Kebab/snake-case slugs only — no dots, slashes, or path separators
// (blocks `../` traversal and any encoded path tricks).
const SLUG_RE = /^[a-zA-Z0-9_-]+$/;
// Tier quiz names carry colons: `<series>:lesson:<slug>` / `:check:<n>` /
// `:exam` (ADR-101). Colon allowed, still no dots/slashes/spaces.
const QUIZ_NAME_RE = /^[a-zA-Z0-9:_-]+$/;
// Canonical namespaced content slug, e.g. `blog/<slug>` / `lesson/<slug>`
// (ADR-002 storage form — localStorage keys, DB content_slug, and the
// summary merge all use the prefixed form). One fixed namespace + one
// bare slug: still no `..`, no dots, no extra slashes → path traversal
// stays blocked (F2).
const NAMESPACED_SLUG_RE = /^(blog|lesson)\/[a-zA-Z0-9_-]+$/;

export interface ValidateSlugOptions {
  /**
   * Accept the canonical namespaced form `blog/<slug>` / `lesson/<slug>`
   * in addition to the bare slug form. Used by contentSlug on the read
   * API; lessonSlug / quizName stay strict (bare only).
   */
  allowNamespaced?: boolean;
}

/**
 * Validate a slug (contentSlug / lessonSlug / quizName).
 * Returns a human-readable message string on failure, or `null` on pass.
 */
export function validateSlug(
  value: unknown,
  label: string,
  options?: ValidateSlugOptions,
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${label} is required`;
  }
  if (value.length > SLUG_MAX) {
    return `${label} must be ${SLUG_MAX} characters or fewer`;
  }
  const ok = options?.allowNamespaced
    ? SLUG_RE.test(value) || NAMESPACED_SLUG_RE.test(value)
    : SLUG_RE.test(value);
  if (!ok) {
    return `${label} contains invalid characters`;
  }
  return null;
}

/**
 * Validate a tier quiz name (`<series>:lesson:<slug>` / `:check:<n>` /
 * `:exam`, ADR-101). Colon allowed; dots/slashes/spaces still rejected so the
 * value can never reach a filesystem join or a path traversal.
 * Returns a message string on failure, or `null` on pass.
 */
export function validateQuizName(
  value: unknown,
  label: string,
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${label} is required`;
  }
  if (value.length > SLUG_MAX) {
    return `${label} must be ${SLUG_MAX} characters or fewer`;
  }
  if (!QUIZ_NAME_RE.test(value)) {
    return `${label} contains invalid characters`;
  }
  return null;
}

/**
 * Validate an integer index (questionIndex / userAnswerIndex).
 * Returns a message string on failure, or `null` on pass.
 */
export function validateIndex(
  value: unknown,
  label: string,
  max: number,
): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return `${label} must be an integer`;
  }
  if (value < 0) {
    return `${label} must be 0 or greater`;
  }
  if (value >= max) {
    return `${label} is out of range`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  In-memory rate limiter (F2)                                        */
/* ------------------------------------------------------------------ */

/**
 * Simple sliding-window rate limiter keyed by IP.
 * Resets its own map on every call; GC-friendly for moderate traffic.
 * Not persisted — restarts with the process.
 *
 * LIMITATION (accepted, low risk): this is in-memory and per-process. On a
 * single instance it is a hard guarantee, but on Vercel's distributed
 * serverless runtime it is per-instance — the effective limit scales with the
 * number of warm instances and resets on cold start, so it is NOT a hard
 * cross-instance cap. For a hard guarantee in high-traffic production, replace
 * this with a shared store (e.g. Upstash Redis) keyed by the same client IP.
 * Per-instance limiting is sufficient for this blog's current traffic.
 */
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;  // per minute per IP

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Returns `true` if the request is allowed, `false` if rate-limited. */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(ip, bucket);
  }
  // Prune entries older than the window
  const cutoff = now - WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= MAX_REQUESTS) {
    return false;
  }
  bucket.timestamps.push(now);
  return true;
}

/**
 * Extract a client IP to key the rate limiter by.
 *
 * Only the connection-proxy's view is trusted — never a client-controlled
 * value. Order:
 *  1. `x-real-ip` — set by a trusted reverse proxy that overwrites it, so it
 *     cannot be spoofed by the client. Preferred when present.
 *  2. `x-forwarded-for` — a hop chain where the client controls the LEFT edge
 *     and each trusted proxy APPENDS its client's IP to the RIGHT. Take the
 *     RIGHTMOST non-empty entry (the most-recently-appended, trusted-hop
 *     value); the leftmost is attacker-spoofable. On Vercel this header is
 *     set by Vercel's own proxy, so the rightmost value is reliable.
 *  3. Loopback — local dev with no proxy headers.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }

  return "127.0.0.1";
}

/* ------------------------------------------------------------------ */
/*  Origin/CSRF check (F6)                                             */
/* ------------------------------------------------------------------ */

const ABSOLUTE_URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * `https://host[:port]` for an absolute http(s) URL (paths/query dropped),
 * otherwise `null` — an opaque `Origin: null` is rejected here.
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

/** Canonical deployment origin: config first, code-level default second. */
function siteOrigin(): string {
  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://adroit.io";
}

/**
 * Origins accepted for a CROSS-origin POST.
 *
 * Config-driven, never a literal deployment list: the previous hardcoded set
 * (`adroit.io`, two retired `*.vercel.app` projects, `localhost:3000`) meant
 * every preview, custom-domain and self-hosted deployment answered 403
 * `Forbidden origin` (QA F1, t_ab6c1cb6). Sources:
 *
 *   - `NEXT_PUBLIC_SITE_URL` (falls back to the canonical production origin)
 *     plus its `www.`/apex sibling;
 *   - `VERCEL_URL` / `VERCEL_BRANCH_URL` / `VERCEL_PROJECT_PRODUCTION_URL` —
 *     the per-deployment origin, so every Vercel preview works unconfigured;
 *   - `AUTH_ALLOWED_ORIGINS` — comma-separated extras (custom domains,
 *     tunnels, a native app's webview origin);
 *   - loopback origins outside production (local dev / `next dev`).
 *
 * Same-origin requests do not need to appear here at all — `checkOrigin()`
 * accepts them from the request's own Host (see `isSameOriginRequest()`).
 */
export function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  const canonical = siteOrigin();
  origins.add(canonical);
  const canonicalUrl = new URL(canonical);
  const bareHost = canonicalUrl.host.replace(/^www\./, "");
  origins.add(`${canonicalUrl.protocol}//www.${bareHost}`);
  origins.add(`${canonicalUrl.protocol}//${bareHost}`);

  // Vercel deployment origins are hostnames only (`VERCEL_URL`) — no scheme.
  for (const raw of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const host = raw?.trim();
    if (!host) continue;
    const normalized = normalizeOrigin(
      /^https?:\/\//i.test(host) ? host : `https://${host}`,
    );
    if (normalized) origins.add(normalized);
  }

  for (const entry of (process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",")) {
    const normalized = normalizeOrigin(entry);
    if (normalized) origins.add(normalized);
  }

  if (process.env.NODE_ENV !== "production") {
    for (const port of [process.env.PORT, "3000", "3001", "3111"]) {
      if (!port) continue;
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }

  return origins;
}

/**
 * Origin of THIS request, derived from the Host it was served for and the
 * proxy's `x-forwarded-proto` (Vercel/every reverse proxy sets it). `null`
 * when the request carries no Host.
 */
export function requestOrigin(req: NextRequest): string | null {
  const host = req.headers.get("host");
  if (!host) return null;

  const forwarded = (req.headers.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const urlProtocol = (() => {
    try {
      return new URL(req.url).protocol.replace(":", "").toLowerCase();
    } catch {
      return "";
    }
  })();
  const protocol =
    forwarded === "https" || forwarded === "http"
      ? forwarded
      : urlProtocol === "https"
        ? "https"
        : "http";

  return normalizeOrigin(`${protocol}://${host}`);
}

/**
 * True when the request's own origin matches `origin` — i.e. the browser is
 * posting from the very deployment that serves the route. This is what makes
 * previews / custom domains / plain-http staging work without any config, and
 * it cannot be forged: a cross-site page cannot set another site's Origin.
 */
function isSameOriginRequest(req: NextRequest, origin: string): boolean {
  return requestOrigin(req) === origin;
}

/**
 * Check the `Origin` header if present.
 * Returns a message on failure, or `null` on pass.
 *
 * No Origin → pass (direct browser navigation / same-origin `fetch` from an
 * old browser). For requests that do carry one: same-origin passes, then the
 * configured cross-origin allowlist, then 403.
 */
export function checkOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // no Origin → direct browser navigation

  const normalized = normalizeOrigin(origin);
  // `Origin: null` (sandboxed iframe / file://) and malformed values fail.
  if (!normalized) return "Forbidden origin";

  if (isSameOriginRequest(req, normalized)) return null;
  if (getAllowedOrigins().has(normalized)) return null;

  return "Forbidden origin";
}

/* ------------------------------------------------------------------ */
/*  Error helpers (F5)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Log a Supabase error server-side and return a sanitised client message.
 * Call this inside the error branch of a Supabase write so the client
 * never sees table/schema/constraint details.
 */
export function sanitiseDbError(error: { message?: string }): string {
  // Log the real error server-side
  console.error("[DB]", error?.message ?? "unknown database error");
  return "Failed to save progress";
}