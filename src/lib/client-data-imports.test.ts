/**
 * src/lib/client-data-imports.test.ts — structural guard for ADR-217/220/221.
 *
 * The whole leak class (S1 funnel, S2 search chunk, S4 labels) came from
 * public surfaces reading the learn CONTENT dataset directly instead of asking
 * "is this series guest-visible?". A comment cannot prevent the fourth
 * recurrence; this test can: no `"use client"` module may import the raw
 * datasets or the server-only data modules.
 *
 * The allowlist is EMPTY by design. If a future client component genuinely
 * needs learn data, it goes through `GET /api/search` or a server component —
 * not into the bundle (that is exactly how the 995 KB chunk happened).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** Modules a client bundle must never reach. */
const FORBIDDEN_IMPORTS = [
  "@/data/learn",
  "@/data/posts",
  "@/lib/learn-visibility",
  "@/lib/search-docs",
] as const;

/** Must stay empty — see the module docstring. */
const ALLOWLIST: readonly string[] = [];

const SRC_ROOT = resolve(process.cwd(), "src");
const CODE_FILE = /\.(ts|tsx)$/;
const CLIENT_DIRECTIVE = /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
    } else if (CODE_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isClientModule(source: string): boolean {
  // The directive must be the first statement (comments allowed above it).
  return CLIENT_DIRECTIVE.test(source.split("\n").slice(0, 6).join("\n"));
}

/** Every module specifier this file imports, statically or dynamically. */
function importedSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const m of source.matchAll(
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g,
  )) {
    specs.push(m[1]);
  }
  return specs;
}

describe("client modules never import learn/post datasets (ADR-217/220/221)", () => {
  const files = walk(SRC_ROOT).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

  it("finds the client components it is meant to guard (self-check)", () => {
    const clients = files.filter((f) => isClientModule(readFileSync(f, "utf8")));
    // 89 `"use client"` modules existed when this guard landed; a collapse to
    // zero would mean the detector silently stopped matching.
    expect(clients.length).toBeGreaterThan(20);
  });

  it("has an empty allowlist", () => {
    expect(ALLOWLIST).toHaveLength(0);
  });

  it("no 'use client' module imports @/data/learn, @/data/posts, @/lib/learn-visibility or @/lib/search-docs", () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;
      const rel = relative(process.cwd(), file);
      if (ALLOWLIST.includes(rel)) continue;
      for (const spec of importedSpecifiers(source)) {
        if ((FORBIDDEN_IMPORTS as readonly string[]).includes(spec)) {
          violations.push(`${rel} → ${spec}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the search overlay free of dataset imports (S2 regression lock)", () => {
    const overlay = readFileSync(
      resolve(SRC_ROOT, "components/SearchOverlay.tsx"),
      "utf8",
    );
    for (const spec of FORBIDDEN_IMPORTS) {
      expect(overlay).not.toContain(`"${spec}"`);
    }
    // It must fetch the filtered index instead.
    expect(overlay).toContain("/api/search");
  });
});
