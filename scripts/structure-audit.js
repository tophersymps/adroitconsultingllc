/* Quick structure audit for B-20/B-21/B-22 */
const fs = require("fs");
const path = require("path");

// Blog categories
const cats = {};
for (const f of fs.readdirSync(path.join(process.cwd(), "content", "blog")).filter(f => f.endsWith(".mdx"))) {
  const src = fs.readFileSync(path.join(process.cwd(), "content", "blog", f), "utf8");
  const m = src.split("---")[1] || "";
  const c = (m.match(/^category:\s*["']?([^"'\n]+)/m) || [])[1];
  if (c) cats[c.trim()] = (cats[c.trim()] || 0) + 1;
}
console.log("Blog categories:", JSON.stringify(cats, null, 2));

// Confirm learn frontmatter tags format (inline vs yaml-list)
let inline = 0, yamlList = 0, other = 0;
for (const dir of fs.readdirSync(path.join(process.cwd(), "content", "learn"))) {
  const d = path.join(process.cwd(), "content", "learn", dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter(f => f.endsWith(".mdx"))) {
    const src = fs.readFileSync(path.join(d, f), "utf8");
    const block = src.split("---")[1] || "";
    if (/tags\s*:\s*\[/.test(block)) inline++;
    else if (/^tags\s*:\s*$/m.test(block)) yamlList++;
    else other++;
  }
}
console.log(`Learn tags format: inline=[${inline}] yamlList=[${yamlList}] other=[${other}]`);

// Count per-tag usage across all posts (to prioritize canonical set)
const counts = {};
for (const f of fs.readdirSync(path.join(process.cwd(), "content", "blog")).filter(f => f.endsWith(".mdx"))) {
  const src = fs.readFileSync(path.join(process.cwd(), "content", "blog", f), "utf8");
  const m = src.split("---")[1] || "";
  const t = m.match(/tags\s*:\s*\[([^\]]*)\]/);
  if (t) for (const x of t[1].matchAll(/"([^"]+)"|'([^']+)'|([A-Za-z0-9 .&/-]+)/g)) {
    const v = (x[1]||x[2]||x[3]||"").trim();
    if (v) counts[v] = (counts[v]||0)+1;
  }
}
const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
console.log("=== Blog tag usage (tag: count) — top 60 ===");
console.log(sorted.slice(0,60).map(([k,v])=>`${v} ${k}`).join("\n"));
console.log("total distinct blog tags:", Object.keys(counts).length);
