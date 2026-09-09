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
    // apps/ was the grafted marketing origin subtree (ADR-004); it was removed
    // at the visual-parity cutover (t_d4138a75) once the root port was complete.
    "apps/**",
  ]),
]);

export default eslintConfig;
