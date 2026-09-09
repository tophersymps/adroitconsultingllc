/**
 * Client-safe Learn helpers — no Node-only imports (no fs/path), safe to
 * import from client components. Pure functions only.
 */

/** Short display label for a series (band tag pill). */
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
