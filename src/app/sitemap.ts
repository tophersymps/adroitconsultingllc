import { type MetadataRoute } from "next";
import { posts } from "@/data/posts";
import { learnLessons } from "@/data/learn";
import { getCertExam, getKnowledgeChecks } from "@/lib/quiz";
import { getAllTags } from "@/lib/tags";
import { siteConfig } from "@/lib/seo";
import {
  getGuestVisibleSeries,
  getGuestVisibleSeriesSlugs,
} from "@/lib/learn-visibility";

/**
 * Sitemap — public index. Blog/marketing/tag routes stay fully public;
 * Learn URLs are emitted ONLY for series a logged-out visitor can actually
 * resolve.
 *
 * ADR-217: the visibility question is NOT answered here any more. This route
 * used to run its own `status='live'` query (which ignored `access_model`, so
 * 96 stealth `hermes-consultant` URLs were submitted to crawlers, all 404s for
 * guests — S3) and carried its own fail-closed fallback. Both now live in
 * `src/lib/learn-visibility.ts`, so the funnel, the search index and this
 * sitemap share ONE predicate (`isGuestVisibleCourse`) and ONE failure mode:
 * on a DB/token outage the seam degrades to the static launch mirror
 * (`PUBLICLY_LAUNCHED_SERIES`, F-2/CWE-200) and every learn URL that cannot be
 * proven guest-visible is dropped. The build never fails on a DB hiccup.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const blogUrl = `${siteConfig.url}${siteConfig.blogPath}`;
  const learnUrl = `${siteConfig.url}${siteConfig.learnPath}`;

  // Guest-visible series (seam): DB-authoritative, fail-closed on failure.
  const guestSlugs = await getGuestVisibleSeriesSlugs();
  const visibleSeries = await getGuestVisibleSeries();
  const visibleLesson = (lesson: { series: string }) =>
    guestSlugs.has(lesson.series);

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
  // is omitted; /tags remains the full "browse all" disclosure.
  const tagPages: MetadataRoute.Sitemap = getAllTags()
    .filter((t) => t.count >= 3)
    .map((t) => ({
      url: `${siteConfig.url}/tags/${t.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

  // Learn hub + series pages (daily content cadence → weekly). Guest-visible
  // only (ADR-217). Hub has no natural date (lastmod omitted); each series uses
  // its NEWEST lesson's date as the content-derived lastmod.
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

  // Learn lesson pages — guest-visible series only. lastmod from lesson date.
  const learnLessonPages: MetadataRoute.Sitemap = learnLessons
    .filter(visibleLesson)
    .map((lesson) => ({
      url: `${learnUrl}/${lesson.series}/${lesson.slug}`,
      ...(lesson.date ? { lastModified: new Date(lesson.date) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // Tier quiz pages — knowledge checks + cert exam (legacy series quiz removed,
  // Decision 8). Only series that ship tier files AND are guest-visible
  // contribute. No natural publish date → lastmod omitted (B-12).
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
