import { MetadataRoute } from 'next';

/**
 * Paths that must never be crawled, by any agent.
 *
 * /preview/ holds auth-gated drafts — never indexable (draft-state).
 * /admin/ is the gated course-admin surface — disallow crawlers
 * (defense-in-depth; the layout also emits noindex, t_d2dfc405).
 */
const DISALLOW = ['/api/', '/preview/', '/admin/', '/lab/'];

/**
 * AI-training / bulk-scraper agents (t_dc2f7d85).
 *
 * adroit.io's Hobby plan allows 4h/month of Fluid Active CPU and cannot buy
 * overage: crossing it pauses the deployment. Measured 2026-11-15, crawlers were
 * driving 4.8-5.0 function requests/min (~207k/month) — including ~30
 * `/field-notes/<article>` fetches in 7 seconds and repeated sitemap.xml +
 * feed.xml re-fetches — against a 554-URL sitemap that grows with every publish.
 * These agents re-walk the whole sitemap and add no traffic, so they are
 * disallowed outright in the durable half of the fix.
 *
 * Googlebot / Bingbot and normal SEO crawlers are NOT in this list and stay
 * fully allowed by the `*` group below. `Google-Extended` and
 * `Applebot-Extended` are the AI-specific opt-outs: they do not affect Google
 * Search or Siri/Spotlight crawling (both keep using `Googlebot`/`Applebot`).
 *
 * Scope, stated honestly: robots.txt binds only compliant crawlers, and it takes
 * effect on their next fetch of this file. It reduces future load; it does not
 * stop an already-running crawl. The immediate block is the Cloudflare bot rule
 * Chris owns.
 */
const AI_SCRAPER_AGENTS = [
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  // Platform AI opt-outs (training only — search crawling is unaffected)
  'Google-Extended',
  'Applebot-Extended',
  // Common Crawl / bulk + training scrapers
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
  'FacebookBot',
  'Diffbot',
  'ImagesiftBot',
  'YouBot',
  'cohere-ai',
  // AI answer engines
  'PerplexityBot',
  'Perplexity-User',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: AI_SCRAPER_AGENTS,
        disallow: '/',
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: 'https://adroit.io/sitemap.xml',
  };
}
