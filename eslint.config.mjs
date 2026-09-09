import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**",
    "next-env.d.ts",
    "scripts/**",
    // Disposable designer scratch tooling — not part of the app bundle.
    "design/.scratch/**",
    // Designer's one-off headless-chromium capture scripts (design deliverables).
    "design/v4/shots/**",
    // apps/web — the grafted marketing origin source, kept read-only as the
    // port reference (ADR-004). Its own lint/tsc live in its own package.json
    // tree; it is inert for the root build until removed at cutover.
    "apps/**",
  ]),
]);

export default eslintConfig;
