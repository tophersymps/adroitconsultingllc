/* Tag vocabulary audit for B-22. Reads generated data + content frontmatter. */
const fs = require("fs");
const path = require("path");

const re = /"tags"\s*:\s*\[([^\]]*)\]/gs;

function tagsFromGenerated(src) {
  const out = new Set();
  let m;
  while ((m = re.exec(src))) {
    for (const t of m[1].matchAll(/"([^"]+)"/g)) out.add(t[1]);
  }
  return out;
}

function tagsFromFrontmatter(file) {
  const src = fs.readFileSync(file, "utf8");
  // frontmatter tags: list under `tags:` (either inline or multiline "- X")
  const tags = new Set();
  const block = src.split("---")[1] || "";
  // inline array
  const inline = block.match(/tags\s*:\s*\[([^\]]*)\]/);
  if (inline) {
    for (const t of inline[1].matchAll(/"([^"]+)"|'([^']+)'|([\w\s&.-]+)/g)) {
      const v = t[1] || t[2] || t[3];
      if (v && v.trim()) tags.add(v.trim());
    }
  }
  // yaml list: tags:\n - X
  const lines = block.split("\n");
  let inTags = false;
  for (const l of lines) {
    if (/^tags\s*:/.test(l)) { inTags = true; continue; }
    if (inTags) {
      if (/^\s*-\s+/.test(l)) tags.add(l.replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      else if (/^\S/.test(l)) inTags = false;
    }
  }
  return tags;
}

const all = new Set();
const postTags = new Set();
for (const f of fs.readdirSync(path.join(process.cwd(), "content", "blog")).filter(f => f.endsWith(".mdx"))) {
  const t = tagsFromFrontmatter(path.join(process.cwd(), "content", "blog", f));
  t.forEach(x => { all.add(x); postTags.add(x); });
}
const learnTags = new Set();
for (const dir of fs.readdirSync(path.join(process.cwd(), "content", "learn"))) {
  const d = path.join(process.cwd(), "content", "learn", dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter(f => f.endsWith(".mdx"))) {
    const t = tagsFromFrontmatter(path.join(d, f));
    t.forEach(x => { all.add(x); learnTags.add(x); });
  }
}

console.log("Blog-post tags:", [...postTags].sort().length, [...postTags].sort().join(" | "));
console.log("---");
console.log("Learn-lesson tags:", [...learnTags].sort().length, [...learnTags].sort().join(" | "));
console.log("---");
console.log("TOTAL unique:", [...all].sort().length, [...all].sort().join(" | "));
