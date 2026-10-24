/**
 * Client-safe Learn helpers — no Node-only imports (no fs/path), safe to
 * import from client components. Pure functions only.
 */

/**
 * Short display label for a series (band tag pill).
 *
 * SECURITY (t_a6b7630b / CWE-200): only PUBLICLY_LAUNCHED_SERIES get an entry
 * here. This module is imported by client components (`PathCard`), so a slug
 * keyed to a stealth series' real name would ship that unpublished course's
 * name in a public chunk. Unlisted slugs fall back to a humanised slug, which
 * only ever runs for a series the surface already decided to render.
 */
export function seriesShortLabel(slug: string): string {
  const map: Record<string, string> = {
    "salesforce-architect": "Salesforce",
    "agentic-ai": "Agentic AI",
    "omni-studio-cert": "OmniStudio",
    "ai-at-work": "AI at Work",
  };
  if (map[slug]) return map[slug];
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
