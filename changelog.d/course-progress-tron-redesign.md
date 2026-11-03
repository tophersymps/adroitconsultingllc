### Course progress & reward system redesign — Adroit Tron progression (t_tron_progression)

**What** - Replaced the static, non-interactive 17th-century constellation SVG engravings on `/atlas/[series]` with the interactive Tron-Matrix Roadmap (`SeriesTronRoadmap.tsx`). Upgraded `/profile` with the Grand Cyber-Constellation Network (`ProfileCyberConstellation.tsx`) linking all user courses as luminous nexus hubs. Upgraded `ConstellationCelebration.tsx` with the high-dopamine milestone card (streak multiplier, domain progress, next lesson CTA). Upgraded `CertificateCelebration.tsx` with the official Adroit Verified Credential pass and 1-click LinkedIn profile integration. Color-matched all surfaces strictly to Adroit brand tokens (`#060F1F`, `#0B1D3A`, `#4FC3F7`, `#C8102E`, `#F59E0B`).

**Why** - The legacy constellation system mapped enterprise tech courses to Greek/Latin mythical figures with fixed star counts, producing fractional sub-dots, non-clickable posters, and an unrewarding progress feel that had no professional value or connection to enterprise architecture.

**Verified** - `npx vitest run` passed (1,824 tests passed across 188 files, including new tests `SeriesTronRoadmap.test.tsx` and `ProfileCyberConstellation.test.tsx`). `npm run build` compiled 1,180 pages with 0 type errors.

**Known Issues** - None.
