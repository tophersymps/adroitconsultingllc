/**
 * src/lib/atlas-launch.test.ts — parity lock for the static launch mirror
 * used when the access seam cannot decide (security t_c4eafa3b F-1/F-2,
 * fix t_64253bbc).
 *
 * `isPubliclyLaunchedSeries()` decides whether a route may degrade to an
 * availability notice during a credential outage or must 404. If the mirror
 * drifts from the DB seed, a real launch would 404 during an outage (or worse,
 * a stealth series could be added to the mirror and leak). This test reads the
 * seed migration directly so the two cannot silently diverge.
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

describe("atlas-launch mirror", () => {
  it("matches the live `courses` rows seeded by migration 008", () => {
    const seeded = seededLiveSeriesSlugs().sort();
    // Guard against a regex that silently matched nothing.
    expect(seeded.length).toBeGreaterThan(0);
    expect([...PUBLICLY_LAUNCHED_SERIES].sort()).toEqual(seeded);
  });

  it("never names a stealth (access_model = 'granted') series", () => {
    // ADR-219: this mirror is the FAIL-CLOSED fallback every public surface
    // falls back to on a DB/token failure. A `granted` row in the mirror would
    // publish a stealth course's existence during an outage — the exact
    // disclosure this card exists to prevent.
    const models = seededAccessModels();
    for (const slug of PUBLICLY_LAUNCHED_SERIES) {
      expect(models.has(slug)).toBe(true);
      expect(models.get(slug)).not.toBe("granted");
    }
  });

  it("treats the four seeded series as launched", () => {
    for (const slug of [
      "agentic-ai",
      "ai-at-work",
      "omni-studio-cert",
      "salesforce-architect",
    ]) {
      expect(isPubliclyLaunchedSeries(slug)).toBe(true);
    }
  });

  it("treats every stealth / unpublished series as NOT launched", () => {
    for (const slug of [
      "hermes-consultant",
      "hermes-consultant-intermediate",
      "hermes-consultant-advanced",
      "ai-adoption",
      "ai-power-user",
      "salesforce-data-architect",
      "salesforce-sharing-visibility-architect",
      "sf-omni-consultant",
      "does-not-exist",
    ]) {
      expect(isPubliclyLaunchedSeries(slug)).toBe(false);
    }
  });
});

/**
 * t_b4c0da5f (MEDIUM, CWE-200): the DISCLOSURE predicate combines the static
 * mirror with the `courses.status` read. A mirror-listed series that ops
 * delists in the DB must stop being named publicly (404 head, blog funnel),
 * while an unreadable DB must fall back to the mirror (never a fresh 404 on a
 * launched series during an outage).
 */
describe("mayDiscloseSeries", () => {
  it("allows a mirrored series when the DB says live", () => {
    expect(mayDiscloseSeries("agentic-ai", true)).toBe(true);
  });

  it("refuses a mirrored series the DB calls delisted", () => {
    expect(mayDiscloseSeries("agentic-ai", false)).toBe(false);
  });

  it("falls back to the mirror when the DB is unreadable", () => {
    expect(mayDiscloseSeries("agentic-ai", null)).toBe(true);
    expect(mayDiscloseSeries("hermes-consultant", null)).toBe(false);
  });

  it("never allows a series outside the mirror, whatever the DB says", () => {
    expect(mayDiscloseSeries("hermes-consultant", true)).toBe(false);
    expect(mayDiscloseSeries("hermes-consultant", false)).toBe(false);
  });
});
