import { type MetadataRoute } from "next";
import { posts } from "@/data/posts";
import { learnLessons, learnSeries } from "@/data/learn";
import { getCertExam, getKnowledgeChecks } from "@/lib/quiz";
import { getAllTags } from "@/lib/tags";
import { siteConfig } from "@/lib/seo";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";

/**
 * Sitemap — public index. Per AC-5, learn URLs are included ONLY for courses
 * whose `courses` row status is `live` (pending/archived are excluded; a
 * content series with no DB row is treated as not-launched). Blog routes stay
 * fully public and unchanged.
 *
 * The live set is read via the SERVICE client (a system-level read of public
 * data — never used to resolve a per-user decision). If the DB is unreachable
 * at build time the build must never fail on a DB hiccup (arch §10 risk
 * mitigation) — but it also must never disclose a series it cannot prove is
 * live. The fallback is therefore the STATIC launch mirror
 * (`isPubliclyLaunchedSeries`), the same DB-free predicate the atlas routes use
 * on their `unavailable` path (F-2, CWE-200). Failing open to "every content
 * series" published unpublished/stealth course URLs to crawlers during a
 * token outage (136 URLs measured, t_0194c233 option 1), so it is fail CLOSED.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogUrl = `${siteConfig.url}${siteConfig.blogPath}`;
  const learnUrl = `${siteConfig.url}${siteConfig.learnPath}`;

  // Live series slugs from the DB (source of truth for status).
  let liveSlugs: Set<string> | null = null;
  try {
    // Sitemap generation runs outside a request, so there is no session to
    // forward: read the public catalog as the Data API `anonymous` role (the
    // "courses_select_live_or_admin" policy still restricts it to live rows).
    const { getSupabaseAnonymousClient } = await import("@/lib/db/server");
    const supabase = await getSupabaseAnonymousClient();
    const { data, error } = await supabase
      .from("courses")
      .select("series_slug")
      .eq("status", "live");
    if (!error && data) {
      liveSlugs = new Set(
        (data as { series_slug: string }[]).map((r) => r.series_slug),
      );
    }
  } catch {
    liveSlugs = null;
  }
  // Publication requires BOTH authorities (t_0194c233 doctrine, Q1 of
  // t_466b3b10): `courses.status = 'live'` is the authority for ACCESS
  // (rendering), the static launch mirror `isPubliclyLaunchedSeries` is the
  // authority for DISCLOSURE (naming). A slug may be listed publicly IFF it is
  // in the mirror AND (the DB is unreadable OR the row is live).
  //
  // F-2 / CWE-200 (t_0194c233): FAIL CLOSED on the outage path. When the
  // courses table cannot be read we cannot prove ANY series is live, so the
  // learn section falls back to the static launch mirror — never to every
  // content series, which would advertise unpublished ("stealth") courses to
  // crawlers from a session-free surface.
  //
  // Q1 (t_466b3b10): INTERSECT on the healthy path too. The `/admin` course
  // surface can flip a `courses` row to `live` at runtime, bypassing the seed
  // migration the mirror is asserted against. Without the intersection such a
  // row would be listed here while its own `generateMetadata` emits the generic
  // `noindex` title — handing Google an indexable URL that says "do not index"
  // and advertising an unpublished series from the most crawler-visible
  // surface on the site. Static marketing/blog/tag URLs are unaffected.
  const launchedSeries = learnSeries.filter((s) =>
    isPubliclyLaunchedSeries(s.slug),
  );
  const liveSet = new Set(
    (liveSlugs
      ? launchedSeries.filter((s) => liveSlugs!.has(s.slug))
      : launchedSeries
    ).map((s) => s.slug),
  );
  if (!liveSlugs) {
    console.warn(
      "[sitemap] courses table unreachable — restricting learn series to the static launched-series mirror",
    );
  } else {
    // Drift visibility: a `courses` row marked live for a series the mirror does
    // not know is silently omitted by the intersection above. Omission is the
    // safe direction, but it must never be invisible — log the offending slugs
    // ONCE (build log, never per URL). Silent when there is no drift.
    const drifted = [...liveSlugs]
      .filter((slug) => !isPubliclyLaunchedSeries(slug))
      .sort();
    if (drifted.length > 0) {
      console.warn(
        `[sitemap] courses live but absent from the static launch mirror — omitting: ${drifted.join(", ")}`,
      );
    }
  }
  const isLive = (slug: string) => liveSet.has(slug);
  const visibleSeries = learnSeries.filter((s) => isLive(s.slug));
  const visibleLesson = (lesson: { series: string; slug: string }) =>
    isLive(lesson.series);

  // Static / hub pages — no natural content date, so lastmod is OMITTED
  // (B-12: omitting lastmod kills per-deploy re-crawl churn; a hub page's
  // freshness is implied by its children's lastmods). Includes the ported
  // marketing routes (merger B4: consolidated sitemap for marketing + blog +
  // learn) — root is the marketing home.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/platform-strategy`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/operational-intelligence`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/digital-experience`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/contact`,
      changeFrequency: "yearly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${blogUrl}`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${blogUrl}/categories`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // Blog post pages — lastmod derived from the post's own publish date.
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${blogUrl}/${post.slug}`,
    ...(post.date ? { lastModified: new Date(post.date) } : {}),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  // Tag pages — B-15: emit ONLY tags with >=3 posts (176 one-post thin tag
  // pages dilute crawl budget). Tags have no natural publish date, so lastmod
  // is omitted; /tags remains the full "browse all tags" disclosure.
  const tagPages: MetadataRoute.Sitemap = getAllTags()
    .filter((t) => t.count >= 3)
    .map((t) => ({
      url: `${siteConfig.url}/tags/${t.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

  // Learn hub + series pages (daily content cadence → weekly). Live only (AC-5).
  // Hub has no natural date (lastmod omitted); each series uses its NEWEST
  // lesson's date as the content-derived lastmod.
  const learnHubPages: MetadataRoute.Sitemap = [
    {
      url: `${learnUrl}`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...visibleSeries.map((s) => ({
      url: `${learnUrl}/${s.slug}`,
      ...(s.lessons[0]?.date ? { lastModified: new Date(s.lessons[0].date) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

  // Learn lesson pages — live courses only (AC-5). lastmod from lesson date.
  const learnLessonPages: MetadataRoute.Sitemap = learnLessons
    .filter(visibleLesson)
    .map((lesson) => ({
      url: `${learnUrl}/${lesson.series}/${lesson.slug}`,
      ...(lesson.date ? { lastModified: new Date(lesson.date) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // Tier quiz pages — knowledge checks + cert exam (legacy series quiz removed,
  // Decision 8). Only series that ship tier files AND are live contribute.
  // No natural publish date → lastmod omitted (B-12).
  const checkPages: MetadataRoute.Sitemap = visibleSeries.flatMap((s) =>
    getKnowledgeChecks(s.slug).map((c) => ({
      url: `${learnUrl}/${s.slug}/check/${c.n}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  );
  const examPages: MetadataRoute.Sitemap = visibleSeries
    .filter((s) => getCertExam(s.slug) !== null)
    .map((s) => ({
      url: `${learnUrl}/${s.slug}/exam`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [
    ...staticPages,
    ...blogPages,
    ...tagPages,
    ...learnHubPages,
    ...learnLessonPages,
    ...checkPages,
    ...examPages,
  ];
}
