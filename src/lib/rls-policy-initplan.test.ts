/**
 * rls-policy-initplan.test.ts — keep every is_admin() RLS policy InitPlan-shaped.
 *
 * Why (t_61fbf171): public.is_admin() is SECURITY DEFINER + SET search_path, so
 * the planner cannot inline it. Written bare — `USING (public.is_admin())` or
 * `USING (auth.uid() = user_id OR public.is_admin())` — Postgres re-runs the
 * function once per row; wrapped as `(SELECT public.is_admin())` it is hoisted
 * into an InitPlan and evaluated once per statement. Measured over 200k rows on
 * lesson_completion: 3126.9 ms bare vs 24.2 ms wrapped (~130x), and an admin
 * reading the /api/admin/analytics tables sat in that per-row path.
 *
 * A bare reference still works functionally, so nothing else in CI notices the
 * regression — this guard does. It reads the real migration files (the source of
 * truth applied to Neon), not a copy.
 *
 * Also asserts 001_rls.sql §4b and 003_admin_read_policies.sql declare the same
 * three admin SELECT policies byte-for-byte: 001 converges a fresh branch and
 * 003 restates them for already-applied branches, so a drift between the two
 * would give different policies depending on which file ran last.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations", "neon");
const RLS_FILE = path.join(MIGRATIONS_DIR, "001_rls.sql");
const ADMIN_READ_FILE = path.join(MIGRATIONS_DIR, "003_admin_read_policies.sql");

/** Predicate lines only: indented USING (...) / WITH CHECK (...) statements. */
function predicateLines(sql: string): { line: number; text: string }[] {
  return sql
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(
      ({ text }) =>
        !text.trimStart().startsWith("--") &&
        /^\s+(USING|WITH CHECK)\s*\(/.test(text) &&
        text.includes("is_admin"),
    );
}

function read(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

/** Pull a CREATE POLICY "name" ... ; block out of a migration, whitespace-normalized. */
function policyBlock(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"`);
  expect(start, `CREATE POLICY "${name}" not found`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return sql
    .slice(start, end + 1)
    .replace(/\s+/g, " ")
    .trim();
}

const ADMIN_SELECT_POLICIES = [
  "user_profiles_admin_select",
  "lesson_completion_admin_select",
  "read_progress_admin_select",
];

describe("RLS admin policies are InitPlan-wrapped", () => {
  it.each([RLS_FILE, ADMIN_READ_FILE])(
    "every is_admin() predicate in %s is wrapped in a SELECT subquery",
    (file) => {
      const lines = predicateLines(read(file));
      expect(lines.length).toBeGreaterThan(0);
      const bare = lines.filter(({ text }) => !text.includes("(SELECT public.is_admin())"));
      expect(
        bare.map(({ line, text }) => `${path.basename(file)}:${line} ${text.trim()}`),
        "bare public.is_admin() in a policy predicate re-evaluates per row — wrap it as (SELECT public.is_admin())",
      ).toEqual([]);
    },
  );

  it("001_rls.sql §4b carries no unwrapped is_admin() predicate", () => {
    const sql = read(RLS_FILE);
    const section = sql.slice(sql.indexOf("-- 4b. Admin read policies"), sql.indexOf("-- 5. Post-load repair"));
    const bare = section
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--") && /USING\s*\(\s*public\.is_admin\(\)/.test(l));
    expect(bare).toEqual([]);
  });
});

describe("admin SELECT policies stay identical across 001 §4b and 003", () => {
  const rls = read(RLS_FILE);
  const adminRead = read(ADMIN_READ_FILE);

  it.each(ADMIN_SELECT_POLICIES)("%s is defined identically in both files", (name) => {
    expect(policyBlock(rls, name)).toBe(policyBlock(adminRead, name));
  });
});
