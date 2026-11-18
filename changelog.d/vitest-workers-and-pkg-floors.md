### Configure Vitest maxWorkers and sync package.json caret floors (t_b1355786)

**What** - Set `maxWorkers: 4` (retaining Vitest's default forks pool) in `vitest.config.mts`, and updated caret minimum version floors in `package.json` and the root entry of `package-lock.json` to match the already-installed lockfile versions (`@aws-sdk/client-s3@^3.1171.0`, `@neondatabase/serverless@^1.2.1`, `@tsparticles/react@^4.6.0`, `@tsparticles/slim@^4.6.0`, `@tailwindcss/postcss@^4.3.5`, `tailwindcss@^4.3.5`, `@testing-library/user-event@^14.6.12`, `@vitejs/plugin-react@^6.3.0`, and `vitest@^5.1.1`).

**Why** - Benchmarking `pool: "vmThreads"` cut test duration to 19s but caused 3 route test files (17 tests, including `src/app/api/audio/[slug]/route.test.ts`) to fail due to `node:vm` context differences. Capping the default pool at `maxWorkers: 4` makes plain `npm run test` pass deterministically without 5000ms Windows worker-contention timeouts (`audio-injection.test.ts`, `AudioPlayerScroll.test.tsx`, `LearnHub.requests.test.tsx`), while syncing caret floors prevents future lockfile regenerations from resolving older patch/minor versions.

**Verified** - `npm ci --dry-run` exits 0; `npm run lint` exits 0; `npx tsc --noEmit` exits 0; plain `npm run test` passes all 194 test files (1,880 tests in 99.83s); `npm run build` exits 0 after compiling and generating all 1,324 static pages.

**Known Issues** - None.
