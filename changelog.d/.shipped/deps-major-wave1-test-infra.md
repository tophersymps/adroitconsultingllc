### Upgrade dev and test infrastructure: @types/node 24, vitest 5, jsdom 31 (t_b1355786)

**What** - Upgraded dev and test dependencies in `package.json` and `package-lock.json`: `@types/node` from `^20` (`20.19.43`) to `^24` (`24.19.2`), `vitest` from `^4.1.12` (`4.1.12`) to `^5.1.0` (`5.1.1`), and `jsdom` from `^30.0.1` (`30.1.3`) to `^31.0.1` (`31.0.1`). Updated `src/lib/db/client.test.ts` to capture the singleton `createClient` config passed to `createClientMock` in a test-module variable (`capturedConfig` via `ensureClientConfig`) instead of reading `mock.calls[0]` across tests, keeping tests compatible with Vitest 5's `clearMocks: true` default without modifying production code.

**Why** - Align `@types/node` with the Node `24.x` runtime used in CI (`.github/workflows/ci.yml`) and satisfy `vitest@5.1.x` peer dependencies while keeping `devDependencies` isolated from the production Next.js bundle for a zero-downtime rollout ahead of Wave 2 (`framer-motion` v14).

**Verified** - `npm ci --dry-run` exits 0; `npm run lint` exits 0; `npx tsc --noEmit` exits 0; `npm run test -- --maxWorkers=4` passes all 194 test files (1,880 tests) under Vitest `5.1.1` and jsdom `31.0.1`; `npm run build` exits 0 after compiling and generating all 1,324 static pages.

**Known Issues** - `jsdom@31.0.1` declares `engines.node` `^22.22.2 || ^24.15.0 || >=26.0.0`, so local Node `v22.20.0` logs an `EBADENGINE` warning during `npm install` (CI runs Node `24.x`). The 17 upstream-unpatched `picomatch <=4.0.7` (`GHSA-fc5q-39xc-vjpf`) High dev-tooling audit entries remain tracked in Wave 3.
