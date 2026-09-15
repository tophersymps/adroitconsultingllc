/**
 * Build-time script: reads MDX frontmatter from content/blog/,
 * generates src/data/posts.ts with the static posts array.
 * Run before "next build" or "npm run build".
 */
const fs = require("fs");
const path = require("path");

const BLOG_DIR = path.join(__dirname, "..", "content", "blog");
const OUT_PATH = path.join(__dirname, "..", "src", "data", "posts.ts");

function parseFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---") return [null, raw];
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return [null, raw];
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    let k = line.slice(0, ci).trim();
    let v = line.slice(ci + 1).trim();
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v.startsWith("[")) {
      v = v.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else v = v.replace(/^["']|["']$/g, "");
    fm[k] = v;
  }
  return [fm, lines.slice(end + 1).join("\n")];
}

const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith(".mdx")).sort();
const posts = [];

for (const file of files) {
  const slug = file.replace(/\.mdx$/, "");
  const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf-8");
  const [fm] = parseFrontmatter(raw);
  if (!fm) {
    console.warn(`Warning: ${file} has no frontmatter, skipping`);
    continue;
  }
  const status = fm.status === "draft" ? "draft" : "published";
  if (status === "draft") {
    console.log(`Skipping draft: ${file}`);
    continue;
  }
  posts.push({
    slug: fm.slug || slug,
    title: fm.title || "",
    excerpt: fm.excerpt || "",
    category: fm.category || "",
    categoryColor: fm.categoryColor || "sf",
    categoryGradient: fm.categoryGradient || "",
    date: fm.date || "",
    author: fm.author || "Adroit Consulting",
    authorInitials: fm.authorInitials || "AC",
    readTime: fm.readTime || "5 min read",
    featured: fm.featured || false,
    tags: fm.tags || [],
    bannerImage: fm.bannerImage || undefined,
    status,
  });
}

posts.sort((a, b) => new Date(b.date) - new Date(a.date));

const content = `import { BlogPost } from "./types";

export const posts: BlogPost[] = ${JSON.stringify(posts, null, 2)};
`;

fs.writeFileSync(OUT_PATH, content);
console.log(`Generated posts.ts: ${posts.length} posts from ${files.length} MDX files`);
