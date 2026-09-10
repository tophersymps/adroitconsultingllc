// Definitive path-only proof: apply the rewrite to the HEAD version of each
// changed content file and compare against the working tree. If every file
// matches byte-for-byte, the entire content change is exactly the path rewrite
// and nothing else (no content/meaning edits, no em-dashes introduced).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const H = "https://adroit-blog-two.vercel.app";
const OP = "](";
const REPS = [
  [H + "/learn/", "https://adroit.io/atlas/"],
  [H + "/blog/", "https://adroit.io/field-notes/"],
  ["[adroit-blog-two.vercel.app]", "[adroit.io]"],
  [OP + "/learn/", OP + "/atlas/"],
  [OP + "/blog/", OP + "/field-notes/"],
];

function rewrite(text) {
  for (const [from, to] of REPS) text = text.split(from).join(to);
  return text;
}

const changed = execSync(
  "git diff HEAD --name-only -- content/"
).toString().trim().split("\n").filter(Boolean);

let checked = 0, mismatched = 0;
for (const rel of changed) {
  const headText = execSync(`git show HEAD:${rel}`).toString();
  const workingText = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  checked++;
  if (rewrite(headText) !== workingText) {
    mismatched++;
    console.log("MISMATCH (not purely the path rewrite): " + rel);
  }
}
console.log(`content files checked: ${checked}`);
console.log(`mismatches (non-path-only): ${mismatched}`);
process.exit(mismatched === 0 ? 0 : 1);
