import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LearnHub from "@/components/Learn/LearnHub";
import { getCatalogForUserV2, toLearnHubCards } from "@/lib/catalog";
import { getCatalogOrg } from "@/lib/access";
import { siteConfig } from "@/lib/seo";
import type { CardGateState } from "@/shared/contracts-account";

/**
 * /atlas hub — Learn Platform v2 (ADR-206/210). Buckets purely from DB org
 * rows (catalog_sections / catalog_groups) via the unified CatalogCourse
 * builder — the bucketOf() regex is GONE. Sections render in DB sort_order,
 * groups under them, tracks ordered by Level N (level + sort_order). Course
 * search/filter + difficulty are client-driven over the slim projection.
 *
 * Guest hardening (t_3dbf4826): the client receives only the LearnCardSeries
 * projection (card-render fields + DB org) — per-lesson metadata never ships.
 *
 * PERF (P1, review of t_d3c401c9): /atlas MUST stay prerendered (○). This
 * route is a public marketing hub, and per-request rendering replaces a CDN
 * `x-nextjs-cache: HIT` response (~3 ms TTFB) with an origin render that also
 * runs `getCatalogForUserV2` + `getCatalogOrg` (~60 ms warm, plus cold start).
 *
 * `dynamic = "force-static"` is what actually guarantees that, and it has to
 * be explicit: the catalogue reads below go through the cookie-bound data
 * client (`getSupabaseServerClient` → `cookies()`), a dynamic API, so ANY
 * build in which the data-layer env is set — i.e. every production build —
 * would otherwise emit `ƒ /atlas` (QA F1 on t_3a3d6595: appearing static only
 * because this workspace's `.env.local` lacks NEXT_PUBLIC_NEON_DATA_API_URL,
 * which makes the client throw before `cookies()` is reached). Under
 * force-static the request APIs resolve to empty during the build, which is
 * exactly the projection this hub publishes: the visitor is the anonymous RLS
 * scope, and per-user identity is deliberately NOT resolved here (a cookie read
 * would flip the route back to ƒ and cost the hub its CDN cache).
 */
export const dynamic = "force-static";

/**
 * ISR (SEO-M2, t_dd870a3a): static + `revalidate` = ISR — the route is still
 * prerendered (○) and CDN-served, but re-rendered in the background every
 * hour. Daily publishing therefore no longer needs a redeploy, and a bad
 * runtime render (e.g. a DB blip during a revalidation) self-heals within the
 * hour instead of freezing until the next release.
 */
export const revalidate = 3600;

/** Readable one-liner for the build log (PostgREST errors are plain objects). */
function describeError(err: unknown): string {
  let text: string;
  if (err instanceof Error) text = err.message;
  else if (typeof err === "string") text = err;
  else {
    try {
      text = JSON.stringify(err) ?? String(err);
    } catch {
      text = String(err);
    }
  }
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/**
 * Build-phase detection for the empty-catalogue guard (SEO-M2).
 *
 * Under `force-static` the catalogue reads happen ONCE, at build time, and the
 * resulting HTML is served with `s-maxage=31536000` / `x-nextjs-cache: HIT` —
 * so an empty hub baked at deploy time would be permanent. `NEXT_PHASE` is set
 * by `next build` for the whole build (including prerenders) and is unset in
 * `next start` / `next dev`, which is exactly the "prerender vs runtime"
 * distinction we need.
 *
 * Only armed when the CATALOGUE's data layer is configured — the Neon Data API
 * (`lib/db/server.ts`, R2-2), never the retired Supabase env vars: those were
 * removed from the Vercel project on 2026-11-22 (rollback bridge retired,
 * t_4b1c9124), and keying the guard off them would have silently disarmed it
 * the moment they went, publishing an empty CDN-cached hub. A build
 * environment without a Data API endpoint cannot resolve a catalogue by
 * definition (see the env check in `lib/db/server.ts`), and failing there
 * would break every CI/local build that intentionally runs without data
 * credentials.
 *
 * Scope (SEO-H1, t_b5e0b4bf): the guard is a PRODUCTION-only refusal. Vercel
 * sets the data-layer vars on every environment, so phase+env alone armed it on
 * Preview deployments too — a preview with an unreachable/RLS-restricted
 * catalogue then could not build at all, turning a "publish an empty hub" risk
 * into "cannot ship". Previews fall back to the graceful empty hub; only a
 * production deploy refuses to bake one. `ATLAS_BUILD_GUARD=0` explicitly
 * disables the guard (e.g. a production build against a empty staging DB).
 */
function isProdCatalogueBuild(): boolean {
  if (process.env.ATLAS_BUILD_GUARD === "0") return false;
  // VERCEL_ENV is "production" | "preview" | "development" on Vercel; absent
  // in plain CI/local builds, where a phase-production-build is a real prod
  // build and the guard should stay armed.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return false;
  }
  return (
    process.env.NEXT_PHASE === "phase-production-build" &&
    neonCatalogueConfigured()
  );
}

/**
 * Is the /atlas catalogue's data layer configured for this build?
 *
 * The hub reads its catalogue through `lib/db/server.ts` (Neon Data API), so
 * THAT endpoint is what arms the guard (t_4b1c9124) — the retired Supabase
 * keys say nothing about whether a catalogue read can succeed.
 *
 * `NEXT_PUBLIC_NEON_DATA_API_URL` is the value exported to every build
 * environment and inlined for the browser client (`next.config.ts` reads the
 * same var for CSP `connect-src`); the server-only `NEON_DATA_API_URL` is
 * accepted too so a server-only export still arms the guard. Neither is
 * required to be present for the build to succeed — a missing endpoint means
 * the read throws, which lands in the "warn, don't throw" branch, exactly as
 * before.
 */
function neonCatalogueConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_NEON_DATA_API_URL ||
      process.env.NEON_DATA_API_URL,
  );
}

export default async function LearnLandingPage() {
  // Guest projection — server-side identity is not resolved on this route.
  // A signed-in visitor's cards are upgraded AFTER hydration by the
  // `useCardGateUpgrade` island inside LearnHub (GET /api/atlas/cards), which
  // re-renders the real gate/access/lesson-slug projection client-side. That
  // keeps this render identity-free (hence ○) while the copy is no longer
  // false for signed-in readers (A11Y-M1, t_dd870a3a).
  const gate: CardGateState = "guest-locked";
  const userId: string | null = null;

  let courses: ReturnType<typeof toLearnHubCards> = [];
  let sections: { slug: string; name: string }[] = [];
  let groups: { slug: string; name: string; sectionSlug: string }[] = [];
  let jsonLd = emptyJsonLd();
  let catalogueError: unknown = null;

  try {
    const catalog = await getCatalogForUserV2(userId);
    const org = await getCatalogOrg();

    courses = toLearnHubCards(catalog.courses, {
      // Prerendered guest projection: per-lesson slugs never ship from here.
      includeLessonSlugs: false,
    });
    sections = org.sections.map((s) => ({ slug: s.slug, name: s.name }));
    groups = org.groups.map((g) => ({
      slug: g.slug,
      name: g.name,
      sectionSlug:
        org.sections.find((s) => s.id === g.section_id)?.slug ?? "",
    }));

    jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Adroit Learn — Certifications, Tracks & Learning Paths",
      description:
        "Structured, sequence-aware learning paths on Salesforce certification, the Hermes Consultant Track, and agentic AI implementation.",
      itemListElement: courses.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: `${siteConfig.url}/atlas/${c.slug}`,
      })),
    };
  } catch (err) {
    // DB unreachable → render an empty-but-graceful hub; per-course pages
    // still enforce the seam. (Org + visibility are DB-backed by design.)
    catalogueError = err;
  }

  // SEO-M2 (t_dd870a3a): NEVER bake an empty hub into the prerender. A DB
  // blip during `next build` would otherwise ship 0 cards, no ItemList and no
  // course text behind `s-maxage=31536000` — permanently, until the next
  // redeploy. Fail the build instead; the graceful empty state stays for the
  // runtime/ISR path (where `revalidate = 3600` self-heals within the hour).
  //
  // SEO-H1 (t_b5e0b4bf): only a resolved-to-zero catalogue fails the build.
  // An infra read failure (network/creds/RLS blip) is a WARNING — it says
  // nothing about whether the catalogue is really empty, and hard-failing on
  // it made every Vercel build unshippable when the build env could not read
  // the DB. The empty hub is still CDN-cached for at most one ISR period.
  if (courses.length === 0 && isProdCatalogueBuild()) {
    if (catalogueError !== null) {
      console.error(
        `/atlas build warning: the catalogue read failed (${describeError(
          catalogueError,
        )}). Publishing the graceful empty hub; ISR will retry within ` +
          `revalidate=3600s. Fix the data layer if this is a production build.`,
      );
    } else {
      throw new Error(
        `/atlas prerender aborted: the catalogue resolved to 0 visible ` +
          `courses. Refusing to publish an empty, CDN-cached Atlas hub ` +
          `(SEO-M2 / t_80131e31). Check the data layer before deploying.`,
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        {/* Learn hero — typographic display, not a stock photo */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(55% 110% at 85% -15%, rgba(200,16,46,0.06) 0%, transparent 60%), radial-gradient(45% 90% at 10% -20%, rgba(11,29,58,0.07) 0%, transparent 55%)",
            }}
          />
          <div className="max-w-[1120px] mx-auto px-6 pt-14 pb-24 relative hero-fade-in">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[var(--accent)] uppercase tracking-[0.08em] mb-[18px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Adroit Academy
            </div>
            <h1 className="text-[clamp(2.5rem,5vw,3.25rem)] font-extrabold tracking-[-0.03em] leading-[1.05] text-[var(--ink-primary)] mb-4 bg-gradient-to-r from-[var(--ink-primary)] to-[var(--surface-inverse-hover)] dark:to-[#94A3B8] bg-clip-text text-transparent">
              The Atlas
            </h1>
            <p className="text-[17px] text-[var(--ink-muted)] max-w-[560px] leading-relaxed">
              Certifications, multi-level Tracks, and standalone Learning Paths
              — published daily, read in order, tracked to completion.
            </p>

            {/* Section/group filters + search + card grid (client orchestrator) */}
            <div className="mt-8">
              <LearnHub
                courses={courses}
                gate={gate}
                sections={sections}
                groups={groups}
              />
            </div>
          </div>
        </section>

        {jsonLd.itemListElement.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function emptyJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Adroit Learn",
    description: "Adroit Learn catalog.",
    itemListElement: [] as { "@type": string; position: number; name: string; url: string }[],
  };
}
