// Verify a git-style unified diff is strictly path-only.
const fs = require("fs");
const diffFile = process.argv[2] || "content-rewrite.diff";
const lines = fs.readFileSync(diffFile, "utf8").split("\n");

const H = "https://adroit-blog-two.vercel.app";
const OP = "](";
const REPS = [
  [H + "/learn/", "https://adroit.io/atlas/"],
  [H + "/blog/", "https://adroit.io/field-notes/"],
  ["[adroit-blog-two.vercel.app]", "[adroit.io]"],
  [OP + "/learn/", OP + "/atlas/"],
  [OP + "/blog/", OP + "/field-notes/"],
];

let pairs = 0, bad = 0, badEx = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith("-") && !lines[i].startsWith("--- a/")) {
    const a = lines[i].slice(1);
    const j = i + 1;
    if (j < lines.length && lines[j].startsWith("+") && !lines[j].startsWith("+++ b/")) {
      const b = lines[j].slice(1);
      pairs++;
      let c = a;
      for (const [f, t] of REPS) c = c.split(f).join(t);
      const ok = c === b;
      if (!ok) { bad++; badEx.push([a, b]); }
    }
  }
}
console.log("pairs checked: " + pairs);
console.log("non-path-only pairs: " + bad);
for (const [a, b] of badEx.slice(0, 30)) console.log("  -" + a + "\n  +" + b);
