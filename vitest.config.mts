import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest config for the adroit-blog repo (QA F-3).
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
    },
  },
});
