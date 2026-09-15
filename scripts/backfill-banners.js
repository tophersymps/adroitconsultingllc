// Backfill bannerImage into blog MDX frontmatter (Epic A banner backfill).
// Adds `bannerImage: /banners/category-<color>.png` to any post that lacks it.
const fs = require("fs");
const path = require("path");

const BLOG_DIR = path.join(__dirname, "..", "content", "blog");
const CATEGORY_BANNER = {
  sf: "/banners/category-sf.png",
  react: "/banners/category-react.png",
  ai: "/banners/category-ai.png",
};

const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx")).sort();
let updated = 0;

for (const file of files) {
  const p = path.join(BLOG_DIR, file);
  let raw = fs.readFileSync(p, "utf-8");
  if (raw.includes("bannerImage")) continue;

  const colorMatch = raw.match(/^categoryColor:\s*(sf|react|ai|mkt)/m);
  if (!colorMatch) {
    console.warn(`Skipping ${file}: no categoryColor`);
    continue;
  }
  const banner = CATEGORY_BANNER[colorMatch[1]];
  if (!banner) {
    console.warn(`Skipping ${file}: no banner for ${colorMatch[1]}`);
    continue;
  }

  // Insert bannerImage before the closing frontmatter fence
  const fenceIdx = raw.indexOf("\n---\n", 3);
  if (fenceIdx === -1) {
    console.warn(`Skipping ${file}: no closing frontmatter fence`);
    continue;
  }
  const insertion = `bannerImage: ${banner}\n`;
  raw = raw.slice(0, fenceIdx + 1) + insertion + raw.slice(fenceIdx + 1);
  fs.writeFileSync(p, raw);
  updated++;
  console.log(`Updated ${file} -> ${banner}`);
}

console.log(`\nDone. ${updated} files updated.`);
