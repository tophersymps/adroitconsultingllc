/**
 * src/lib/db/server-only-guard.test.ts — regression test for SEC-R2-2-M2.
 *
 * The R1-4 (F-7) build-time guard `import "server-only";` was present on the
 * Supabase-era privileged modules, and was LOST in the R2-2 swap to the Neon
 * driver: `grep -rn 'import "server-only"' src` returned nothing for a whole
 * release. A lost guard rail is invisible to every other test — a Client
 * Component import only fails at `next build` time, which is exactly the
 * failure mode that can ship a credential path to the browser between builds.
 *
 * This test pins the set so the guard cannot silently disappear again. If a
 * new privileged module appears (a new DATABASE_URL reader), add it here — and
 * add the import to that module first.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

/** Modules that read DATABASE_URL / write SQL directly (deny-client-insert tables). */
const DATABASE_URL_READERS = [
  // Reads DATABASE_URL and writes SQL directly (deny-client-insert tables).
  "src/lib/db/service.ts",
  // Reads DATABASE_URL for admin auth-user reads.
  "src/lib/auth/users.ts",
];

/** Every module that must refuse to be pulled into a client bundle. */
const PRIVILEGED = [
  ...DATABASE_URL_READERS,
  // R2-1 auth routes (t_d9a07839): holds NEON_AUTH_COOKIE_SECRET. Carried over
  // from the Supabase-era R1-4 guard (t_c98e662b) when the auth surface moved.
  "src/lib/auth/server.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function hasServerOnlyImport(file: string): boolean {
  return /^\s*import\s+"server-only";/m.test(readFileSync(file, "utf8"));
}

describe("server-only build-time guards (SEC-R2-2-M2)", () => {
  const files = walk(SRC).map((f) => relative(process.cwd(), f).split(sep).join("/"));

  it.each(PRIVILEGED)("%s imports server-only", (file) => {
    expect(files).toContain(file);
    expect(hasServerOnlyImport(join(process.cwd(), file))).toBe(true);
  });

  it("no other non-test module carries the guard unlisted", () => {
    const guarded = files.filter((f) => hasServerOnlyImport(join(process.cwd(), f)));
    expect(guarded.sort()).toEqual([...PRIVILEGED].sort());
  });

  it("no module outside service.ts / users.ts reads DATABASE_URL", () => {
    const readers = files.filter((f) =>
      /process\.env\.DATABASE_URL(_UNPOOLED)?\b/.test(readFileSync(join(process.cwd(), f), "utf8")),
    );
    expect(readers.sort()).toEqual([...DATABASE_URL_READERS].sort());
  });
});
