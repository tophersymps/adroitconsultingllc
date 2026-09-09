import fs from "fs";
import path from "path";

/**
 * Read the raw MDX content for a blog post by slug.
 * Returns null if the file doesn't exist.
 */
export function getMDXContent(slug: string): string | null {
  const mdxPath = path.join(
    process.cwd(),
    "content",
    "blog",
    `${slug}.mdx`,
  );

  try {
    return fs.readFileSync(mdxPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Parse the `---` frontmatter block from raw MDX.
 * Returns [frontmatter, body] — frontmatter values are strings (or booleans /
 * string arrays for the simple YAML shapes the editorial content uses).
 * Returns [null, raw] when no frontmatter block is present.
 *
 * Shared by the preview routes (which need `status` at request time) and kept
 * consistent with the build-script parser in scripts/build-posts.js.
 */
export function parseMDXFrontmatter(
  raw: string,
): [Record<string, unknown> | null, string] {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return [null, raw];
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return [null, raw];
  const fm: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const k = line.slice(0, ci).trim();
    let v: string | boolean | string[] = line.slice(ci + 1).trim();
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v.startsWith("[")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else v = v.replace(/^["']|["']$/g, "");
    fm[k] = v;
  }
  return [fm, lines.slice(end + 1).join("\n")];
}

/**
 * Read the `status` field from a raw MDX file's frontmatter.
 * Absent → "published" (backward compat). Drafts render via the gated
 * preview routes only; the public build already excludes them.
 */
export function getMDXStatus(raw: string): "draft" | "published" {
  const [fm] = parseMDXFrontmatter(raw);
  if (fm && fm.status === "draft") return "draft";
  return "published";
}

/**
 * Strip the `---` frontmatter block from raw MDX before rendering.
 * Mirrors the Learn renderer fix (lib/learn.ts) — without this the
 * frontmatter YAML blob renders as a stray heading inside the article.
 */
export function stripMDXFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return raw;
  return lines.slice(end + 1).join("\n");
}

/**
 * Convert `[Source: https://...]` citation literals into proper markdown
 * links with a clean anchor (`[Source: domain.com](url)`) so article bodies
 * stop showing raw URL text. Used by the blog + learn MDX renderers.
 *
 * NOTE: The editorial citation style is now GFM endnotes — `[^n]` inline
 * markers with an auto-generated numbered source list (see footnoteLabel in
 * the MDXArticle renderer). This legacy transform is retained as a safety
 * net for any pre-conversion article that still contains `[Source: ...]`
 * literals; new articles should not emit them.
 */
export function linkifySourceCitations(raw: string): string {
  return raw.replace(
    /\[Source:\s+(https?:\/\/[^\]\s]+)\]/g,
    (_match, url: string) => {
      let domain = url;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // keep the URL as anchor text if it won't parse
      }
      return `[Source: ${domain}](${url})`;
    },
  );
}

/**
 * Get a list of all MDX slugs available in content/blog/.
 */
export function getAllMDXSlugs(): string[] {
  const blogDir = path.join(process.cwd(), "content", "blog");

  try {
    const files = fs.readdirSync(blogDir);
    return files
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, ""));
  } catch {
    return [];
  }
}
