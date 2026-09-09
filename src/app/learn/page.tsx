import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LearnHub from "@/components/Learn/LearnHub";
import { getCatalogForUserV2, toLearnHubCards } from "@/lib/catalog";
import { getAccessUserId, getCatalogOrg } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/seo";
import type { CardGateState } from "@/shared/contracts-account";

/**
 * /learn hub — Learn Platform v2 (ADR-206/210). Buckets purely from DB org
 * rows (catalog_sections / catalog_groups) via the unified CatalogCourse
 * builder — the bucketOf() regex is GONE. Sections render in DB sort_order,
 * groups under them, tracks ordered by Level N (level + sort_order). Course
 * search/filter + difficulty are client-driven over the slim projection.
 *
 * Guest hardening (t_3dbf4826): the client receives only the LearnCardSeries
 * projection (card-render fields + DB org) — per-lesson metadata never ships.
 */
export default async function LearnLandingPage() {
  // Auth state (guest vs signed-in) resolved server-side from the HttpOnly
  // cookie — the same source as every other gated surface.
  let gate: CardGateState = "guest-locked";
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) gate = "signed-in";
  } catch {
    // default to guest on session errors
  }

  let courses: ReturnType<typeof toLearnHubCards> = [];
  let sections: { slug: string; name: string }[] = [];
  let groups: { slug: string; name: string; sectionSlug: string }[] = [];
  let jsonLd = emptyJsonLd();

  try {
    const userId = await getAccessUserId();
    const catalog = await getCatalogForUserV2(userId);
    const org = await getCatalogOrg();

    courses = toLearnHubCards(catalog.courses, {
      includeLessonSlugs: gate === "signed-in",
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
        url: `${siteConfig.url}/learn/${c.slug}`,
      })),
    };
  } catch {
    // DB unreachable → render an empty-but-graceful hub; per-course pages
    // still enforce the seam. (Org + visibility are DB-backed by design.)
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
              Learn
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
