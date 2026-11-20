// @vitest-environment node
/**
 * proxy.matcher.test.ts — pins the src/proxy.ts matcher to the gated routes
 * only (t_3f9353a0).
 *
 * WHY THIS TEST EXISTS
 * The proxy matcher is a hand-maintained allow-list. Two failure modes are
 * expensive and silent:
 *
 *   1. A gated page is added (or a public page starts reading the session) and
 *      nobody adds a matcher clause. Proxy never runs for it, the Neon Auth
 *      session cookie is never refreshed on navigation, and signed-in members
 *      get bounced to /login — nobody notices until a customer does.
 *   2. Someone re-widens the matcher back to a catch-all. Proxy then runs on
 *      every cached marketing/field-note page, which is exactly the Vercel
 *      Fast Origin Transfer leak this card closed (Hobby hard-pauses at 10 GB).
 *
 * So the test pins BOTH directions against the real Next matcher: every route
 * whose render path reads auth/access state must match, and every route that
 * does not must not.
 *
 * HOW IT MATCHES
 * Next compiles each matcher string into a regex at build time via
 * `tryToParsePath(...).regexStr` in `getMiddlewareMatchers`
 * (next/dist/build/analysis/get-page-static-info.js) and then runs
 * `new RegExp(matcher.regexp).exec(pathname)` in `getMiddlewareRouteMatcher`.
 * This test reuses `tryToParsePath` so it asserts against the same regex the
 * runtime uses, not a hand-rolled approximation.
 *
 * `getMiddlewareMatchers` additionally appends an OPTIONAL transport prefix and
 * suffix (`/:nextData(...)?`, `{(\.json|...)}?`) that only ever make a source
 * *more* permissive for the same pathname — never less. Asserting with the bare
 * source is therefore the conservative (stricter) form: anything this test says
 * matches, production matches too.
 *
 * NOTE: `next/experimental/testing/server`'s `unstable_doesMiddlewareMatch`
 * would be the other candidate harness, but it pulls in the app-render graph and
 * throws "Invariant: AsyncLocalStorage accessed in runtime where it is not
 * available" under vitest. `tryToParsePath` is the same primitive without that
 * dependency, so this file runs in the `node` environment.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";

import { config as proxyConfig } from "./proxy";

/* ------------------------------------------------------------------ matcher */

const matcherSources = proxyConfig.matcher;
const matcherRegexes = matcherSources.map(
  (source) => new RegExp(tryToParsePath(source).regexStr ?? "(?!)"),
);

/** True when Next's proxy would run for this pathname. */
const proxyRunsOn = (pathname: string): boolean =>
  matcherRegexes.some((re) => re.exec(pathname) !== null);

/** Which matcher clause covers a pathname (for readable failure output). */
const coveringSource = (pathname: string): string | null =>
  matcherSources.find(
    (source) => new RegExp(tryToParsePath(source).regexStr ?? "(?!)").exec(pathname) !== null,
  ) ?? null;

/* ------------------------------------------------- explicit route contract */

/**
 * Concrete paths under every gated route, with the page file that makes them
 * gated. Kept explicit (rather than fully derived) because this list is the
 * reviewed contract; the filesystem scan below is the automated backstop.
 */
const GATED_PATHS: { path: string; why: string }[] = [
  { path: "/admin", why: "src/app/admin/layout.tsx requires an admin session" },
  { path: "/admin/users", why: "src/app/admin/users/page.tsx (admin layout guard)" },
  { path: "/admin/access/courses", why: "src/app/admin/access/courses/page.tsx" },
  { path: "/admin/analytics", why: "src/app/admin/analytics/page.tsx" },
  { path: "/atlas", why: "src/app/atlas/page.tsx reads @/lib/access (per-user gate state)" },
  { path: "/atlas/agentic-systems", why: "src/app/atlas/[series]/page.tsx" },
  { path: "/atlas/agentic-systems/what-is-an-agent", why: "src/app/atlas/[series]/[slug]/page.tsx" },
  { path: "/atlas/agentic-systems/check/1", why: "src/app/atlas/[series]/check/[n]/page.tsx" },
  { path: "/atlas/agentic-systems/exam", why: "src/app/atlas/[series]/exam/page.tsx" },
  { path: "/atlas/agentic-systems/certificate", why: "src/app/atlas/[series]/certificate/page.tsx" },
  { path: "/atlas/agentic-systems/preview", why: "src/app/atlas/[series]/preview/page.tsx" },
  { path: "/preview/atlas/agentic-systems/what-is-an-agent", why: "src/app/preview/atlas/[series]/[slug]/page.tsx" },
  { path: "/preview/field-notes/draft-note", why: "src/app/preview/field-notes/[slug]/page.tsx" },
  { path: "/profile", why: "src/app/profile/page.tsx reads the SSR session" },
  { path: "/settings", why: "src/app/settings/page.tsx redirects guests to /login" },
];

/**
 * Concrete paths that must NOT invoke Proxy. Every one of these is a page whose
 * render path reads no auth/access state — serving them with a Middleware leg is
 * pure Fast Origin Transfer burn.
 */
const PUBLIC_PATHS: { path: string; why: string }[] = [
  { path: "/", why: "marketing home" },
  { path: "/contact", why: "contact page" },
  { path: "/digital-experience", why: "service page" },
  { path: "/operational-intelligence", why: "service page" },
  { path: "/platform-strategy", why: "service page" },
  { path: "/privacy", why: "static policy page" },
  { path: "/field-notes", why: "field-notes index" },
  { path: "/field-notes/categories", why: "category index" },
  { path: "/field-notes/some-published-article", why: "public article" },
  { path: "/tags", why: "tag index" },
  { path: "/tags/ai", why: "tag page" },
  { path: "/lab/hubble-field", why: "standalone demo page" },
  { path: "/login", why: "auth-entry form (no render-path session read)" },
  { path: "/forgot-password", why: "auth-entry form" },
  { path: "/reset-password", why: "auth-entry form" },
];

describe("proxy matcher — allow-list is not empty and stays literal", () => {
  it("exports a non-empty array of absolute path strings", () => {
    expect(Array.isArray(matcherSources)).toBe(true);
    expect(matcherSources.length).toBeGreaterThan(0);
    for (const source of matcherSources) {
      expect(typeof source).toBe("string");
      expect(source.startsWith("/")).toBe(true);
    }
  });

  it("does not fall back to a catch-all that runs on every path", () => {
    // A catch-all is the regression this card exists to prevent: it re-enables
    // the Middleware leg on cached public HTML.
    for (const source of matcherSources) {
      const re = new RegExp(tryToParsePath(source).regexStr ?? "(?!)");
      expect(re.exec("/field-notes")).toBeNull();
      expect(re.exec("/")).toBeNull();
    }
  });

  it("keeps /api/** and /_next/** out of proxy scope", () => {
    for (const pathname of [
      "/api/auth/session",
      "/api/progress/summary",
      "/api/continue-learning",
      "/_next/static/chunks/main.js",
      "/_next/image",
    ]) {
      expect(proxyRunsOn(pathname), `${pathname} must not invoke Proxy`).toBe(false);
    }
  });
});

describe("proxy matcher — every gated route is covered", () => {
  it.each(GATED_PATHS)("runs on $path ($why)", ({ path }) => {
    expect(proxyRunsOn(path), `no matcher clause covers ${path}`).toBe(true);
  });
});

describe("proxy matcher — no public route is covered", () => {
  it.each(PUBLIC_PATHS)("skips $path ($why)", ({ path }) => {
    expect(
      coveringSource(path),
      `${path} is matched by proxy matcher ${coveringSource(path)} but its render path reads no session`,
    ).toBeNull();
  });
});

/* -------------------------------------------------- filesystem backstop */

const APP_DIR = fileURLToPath(new URL("./app", import.meta.url));

/**
 * Signals that a module's render path reads auth/access state. Deliberately a
 * short, explicit list of the seams adroit actually uses; a new seam means a new
 * entry here AND (usually) a new matcher clause.
 */
const GATED_SIGNALS: RegExp[] = [
  /["']@\/lib\/auth/, //            session helpers
  /["']@\/lib\/access/, //          getCatalogForUserV2 / getCatalogOrg / access seam
  /["']@\/lib\/admin/, //           requireAdminPage
  /["']@\/lib\/preview-auth/, //    isPreviewEmailAllowed
  /\baccessSeam\b|\bgetAccessUserId\b|\bgetCurrentUser\b/,
];

/** The SSR session client pattern: lib/db/server + `auth.getUser()`. */
function readsSsrSession(content: string): boolean {
  return /["']@\/lib\/db\/server/.test(content) && /\.auth\.getUser\(/.test(content);
}

function isGatedModule(content: string): boolean {
  return GATED_SIGNALS.some((re) => re.test(content)) || readsSsrSession(content);
}

/** `/atlas/[series]/[slug]/page.tsx` → `/atlas/series-x/slug-x`. */
function toSamplePath(filePath: string): string {
  const rel = filePath.slice(APP_DIR.length);
  const segments = rel
    .replace(/\/(page|layout)\.tsx$/, "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment)) // route groups
    .map((segment) =>
      segment.replace(/^\[\[?\.{0,3}(.+?)\]\]?$/, (_match, param: string) => `${param}-x`),
    );
  return `/${segments.join("/")}`;
}

function collectAppFiles(): { path: string; content: string }[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\/(page|layout)\.tsx$/.test(`/${entry}`))
    .map((entry) => ({
      path: `${APP_DIR}/${entry}`,
      content: readFileSync(`${APP_DIR}/${entry}`, "utf8"),
    }));
}

describe("proxy matcher — derived from the app tree, not just the table above", () => {
  const files = collectAppFiles();
  const gatedLayoutDirs = new Set(
    files
      .filter((file) => /\/layout\.tsx$/.test(file.path) && isGatedModule(file.content))
      .map((file) => file.path.replace(/\/layout\.tsx$/, "")),
  );

  /** A page is gated if it (or any ancestor layout) reads auth/access state. */
  const pages = files
    .filter((file) => /\/page\.tsx$/.test(file.path))
    .map((file) => ({
      ...file,
      dir: file.path.replace(/\/page\.tsx$/, ""),
      gated:
        isGatedModule(file.content) ||
        [...gatedLayoutDirs].some(
          (layoutDir) => file.path === `${layoutDir}/page.tsx` || file.path.startsWith(`${layoutDir}/`),
        ),
    }));

  const derivedGated = pages.filter((page) => page.gated);
  const derivedPublic = pages.filter((page) => !page.gated);

  it("finds the gated pages (sanity: the scan is not silently empty)", () => {
    expect(derivedGated.length).toBeGreaterThanOrEqual(8);
    expect(derivedPublic.length).toBeGreaterThanOrEqual(10);
  });

  it("every page whose render path reads auth/access state is covered by the matcher", () => {
    const uncovered = derivedGated
      .map((page) => toSamplePath(page.path))
      .filter((path) => !proxyRunsOn(path));
    expect(
      uncovered,
      `these gated pages are not covered by config.matcher (add a clause to src/proxy.ts): ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("no page that reads no auth/access state is covered by the matcher", () => {
    const overCovered = derivedPublic
      .map((page) => ({ path: toSamplePath(page.path), source: coveringSource(toSamplePath(page.path)) }))
      .filter((entry) => entry.source !== null);
    expect(
      overCovered,
      `these public pages still invoke Proxy (Fast Origin Transfer leak): ${overCovered
        .map((entry) => `${entry.path} ← ${entry.source}`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
