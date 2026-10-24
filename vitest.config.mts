import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest config for the adroitconsultingllc repo (QA F-3).
 *
 * - jsdom environment so localStorage / DOM APIs are available.
 * - `@` alias mirrors tsconfig paths (Next.js convention).
 * - setup file extends expect with jest-dom matchers.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "scripts"],
  },
  resolve: {
    alias: {
      /*
       * `fileURLToPath`, not `.pathname` — the latter percent-encodes spaces
       * and keeps a leading slash before the Windows drive letter, so a repo
       * checked out to a path like "…/Adroit Consulting" resolved every `@/`
       * import to a directory that does not exist.
       */
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only` is a build-time marker: its package `exports` maps the
       * `react-server` condition (what Next's bundler sets for the server
       * graph) to an empty module, and everything else to a thrower. Vitest
       * runs in jsdom/plain Node with no such condition, so importing a
       * privileged module (service.ts / auth-admin.ts) would throw before a
       * single assertion ran. Alias it to the same empty module Next resolves,
       * which keeps the guard real where it matters (the bundler) and keeps
       * the unit tests able to exercise these modules directly.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
