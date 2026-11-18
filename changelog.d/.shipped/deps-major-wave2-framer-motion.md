### Upgrade framer-motion from v13 to v14 (t_b1355786)

**What** - Upgraded `framer-motion` in `package.json` and `package-lock.json` from `^13.5.1` (`13.5.1`) to `^14.14.0` (`14.14.0`), covering `ParticleNetwork.tsx`, `ScrollReveal.tsx`, `StaggerChildren.tsx`, and the test stub in `src/app/contact/page.test.tsx`.

**Why** - Execute Wave 2 of the zero-downtime dependency upgrade plan in isolation with an opt-in `[preview]` Vercel deployment before merging to `main`, keeping React 19 compatibility current across marketing animation components.

**Verified** - `npm ci --dry-run` exits 0; `npm run lint` exits 0; `npx tsc --noEmit` exits 0; `npm run test -- --maxWorkers=4` passes all 194 test files (1,880 tests); `npm run build` exits 0 after compiling and generating all 1,324 static pages; local browser check on `http://localhost:3000/` and `/contact` rendered `ParticleNetwork`, `ScrollReveal`, and `StaggerChildren` with HTTP 200 and zero console or hydration errors.

**Known Issues** - Remaining Wave 3 items (`eslint` 10, `typescript` 7, and upstream security watches for `picomatch >4.0.7` and `@neondatabase/auth >0.7.0-beta`) stay held pending upstream peer support.
