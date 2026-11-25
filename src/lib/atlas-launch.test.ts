/**
 * src/lib/atlas-launch.test.ts — parity lock for the static launch snapshot
 * used when the access seam cannot decide (security t_c4eafa3b F-1/F-2,
 * fix t_64253bbc; snapshot demoted to an outage fallback in t_47183b5b).
 *
 * `isPubliclyLaunchedSeries()` decides whether a route may degrade to an
 * availability notice during a credential outage or must 404. If the snapshot
 * drifts from the seeded + admin-launched rows, a real launch would 404 during
 * an outage (or worse, a stealth series could be added and leak). This test
 * reads the seed migration directly so the two cannot silently diverge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PUBLICLY_LAUNCHED_SERIES,
  isPubliclyLaunchedSeries,
  mayDiscloseSeries,
} from "@/lib/atlas-launch";

// vitest runs from the repo root (jsdom has no file:// import.meta.url).
const SEED_PATH = resolve(process.cwd(), "supabase/migrations/008_course_catalog.sql");

/** series_slug values seeded as `status = 'live'` in migration 008. */
function seededLiveSeriesSlugs(): string[] {
  const sql = readFileSync(SEED_PATH, "utf8");
  const insert = sql.slice(sql.indexOf("insert into public.courses"));
  const body = insert.slice(0, insert.indexOf(";"));
  return [...body.matchAll(/'([a-z0-9-]+)',\s*'[^']*',\s*'live'/g)].map(
    (m) => m[1],
  );
}

/** series_slug → seeded `access_model` from migration 008. */
function seededAccessModels(): Map<string, string> {
  const sql = readFileSync(SEED_PATH, "utf8");
  const insert = sql.slice(sql.indexOf("insert into public.courses"));
  const body = insert.slice(0, insert.indexOf(";"));
  const rows = [...body.matchAll(
    /\(\s*'([a-z0-9-]+)',\s*'[^']*',\s*'(pending|live|archived)',\s*'([a-z-]+)'/g,
  )];
  return new Map(rows.map((m) => [m[1], m[3]]));
}

/**
 * Launched through `/admin` (`PATCH /api/admin/courses/[slug]` sets
 * `status = 'live'`), so there is no seed migration for them — by design, not
 * an omission (t_47183b5b). They still belong in the snapshot so their public
 * surface can degrade during a credential outage.
 */
const ADMIN_LAUNCHED_SERIES = [
  "ai-adoption",
  "ai-power-user",
  "salesforce-data-architect",
  "salesforce-sharing-visibility-architect",
  "sf-agentforce-sales-consultant",
  "sf-agentforce-specialist",
  "sf-data360-consultant",
  "sf-omni-consultant",
] as const;

/** The stealth boundary (`access_model = 'granted'`): never in the snapshot. */
const STEALTH_SERIES = [
  "hermes-consultant",
  "hermes-consultant-intermediate",
  "hermes-consultant-advanced",
] as const;

describe("atlas-launch mirror", () => {
  it("mirrors the live `courses` rows seeded by migration 008 plus the admin launches", () => {
    const seeded = seededLiveSeriesSlugs().sort();
    // Guard against a regex that silently matched nothing.
    expect(seeded.length).toBeGreaterThan(0);
    expect([...PUBLICLY_LAUNCHED_SERIES].sort()).toEqual(
      [...seeded, ...ADMIN_LAUNCHED_SERIES].sort(),
    );
  });

  it("never names a stealth (access_model = 'granted') series", () => {
    // ADR-219: this snapshot is the FAIL-CLOSED fallback every public surface
    // falls back to on a DB/token failure. A `granted` row in the mirror would
    // publish a stealth course's existence during an outage — the exact
    // disclosure this module exists to prevent.
    for (const slug of STEALTH_SERIES) {
      expect(isPubliclyLaunchedSeries(slug)).toBe(false);
    }
    // Keep the migration-derived access_model check for whichever mirror slugs
    // the migrations know. Admin-launched slugs have no seed row (by design),
    // so they are covered by their own assertion above.
    const models = seededAccessModels();
    for (const slug of PUBLICLY_LAUNCHED_SERIES) {
      if (!models.has(slug)) continue;
      expect(models.get(slug)).not.toBe("granted");
    }
  });

  it("treats every mirrored series as launched", () => {
    for (const slug of PUBLICLY_LAUNCHED_SERIES) {
      expect(isPubliclyLaunchedSeries(slug)).toBe(true);
    }
  });

  it("treats every stealth / unpublished series as NOT launched", () => {
    for (const slug of [...STEALTH_SERIES, "does-not-exist"]) {
      expect(isPubliclyLaunchedSeries(slug)).toBe(false);
    }
  });
});

/**
 * t_b4c0da5f (MEDIUM, CWE-200) named the DISCLOSURE predicate; t_47183b5b made
 * the DB its authority. The DB verdict decides whenever it is readable — a
 * mirror-listed series that ops delists in the DB must stop being named
 * publicly (404 head, blog funnel) — while an unreadable DB must fall back to
 * the static snapshot (never a fresh 404 on a launched series during an outage).
 *
 * Note there is NO mirror intersection on the readable path: the second
 * argument is already the guest-visibility verdict from `access.ts`
 * (`isGuestVisibleCourse`), so intersecting again could only drop non-stealth
 * rows — how every `/admin` launch since 2026-10-23 became undiscoverable.
 */
describe("mayDiscloseSeries", () => {
  it("discloses a DB-guest-visible series the snapshot never listed", () => {
    expect(mayDiscloseSeries("brand-new-course", true)).toBe(true);
    expect(mayDiscloseSeries("ai-adoption", true)).toBe(true);
  });

  it("refuses a series the DB says a guest cannot resolve", () => {
    expect(mayDiscloseSeries("agentic-ai", false)).toBe(false);
    expect(mayDiscloseSeries("hermes-consultant", false)).toBe(false);
  });

  it("falls back to the static snapshot when the DB is unreadable", () => {
    expect(mayDiscloseSeries("agentic-ai", null)).toBe(true);
    expect(mayDiscloseSeries("ai-adoption", null)).toBe(true);
    expect(mayDiscloseSeries("hermes-consultant", null)).toBe(false);
    expect(mayDiscloseSeries("does-not-exist", null)).toBe(false);
  });
});
