/** Verify content tags resolve to the canonical vocabulary (B-22). */
const fs = require("fs");
const path = require("path");

const BLOG_DIR = path.join(__dirname, "..", "content", "blog");
const LEARN_DIR = path.join(__dirname, "..", "content", "learn");
const VOCAB_FILE = path.join(__dirname, "..", "src", "lib", "tag-vocab.ts");
const vocabSrc = fs.readFileSync(VOCAB_FILE, "utf-8");
const canonical = new Set(
  [...vocabSrc.matchAll(/^\s*\["([^"]+)",/gm)].map((m) => m[1]),
);

function parseTags(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  const line = m[1].split("\n").find((l) => /^\s*tags\s*:/.test(l));
  if (!line) return [];
  const val = line.slice(line.indexOf(":") + 1).trim();
  if (val.startsWith("[")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return val.replace(/^["']|["']$/g, "") ? [val.replace(/^["']|["']$/g, "")] : [];
}

const seen = new Map();
const unknown = new Set();

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mdx"))) {
    for (const t of parseTags(path.join(dir, f))) {
      seen.set(t, (seen.get(t) || 0) + 1);
      if (!canonical.has(t)) unknown.add(t);
    }
  }
}
scan(BLOG_DIR);
for (const s of fs.readdirSync(LEARN_DIR).filter((d) => !d.startsWith("."))) scan(path.join(LEARN_DIR, s));

console.log(`Distinct tags now in content: ${seen.size}`);
console.log(`Non-canonical (should be empty): ${[...unknown].sort().join(" | ") || "NONE"}`);
console.log(`\nTag usage:`);
[...seen.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${String(c).padStart(3)}  ${t}`));
