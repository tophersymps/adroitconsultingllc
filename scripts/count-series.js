const fs = require("fs");
const src = fs.readFileSync("src/data/learn.ts", "utf-8");
const series = ["salesforce-architect","omni-studio-cert","ai-at-work","hermes-consultant","hermes-consultant-intermediate","hermes-consultant-advanced","agentic-ai"];
// Split into series blocks, count "series": "<slug>" lesson occurrences (each lesson has exactly one)
for (const s of series) {
  // lessons array entries carry "series": "<slug>" once each
  const re = new RegExp('"series": "' + s + '"', "g");
  const count = (src.match(re) || []).length;
  // totalLessons is separate; report
  console.log(s, "lesson-objects:", count);
}
