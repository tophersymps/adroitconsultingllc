/**
 * B-22 — Apply the canonical tag vocabulary to content frontmatter.
 *
 * Reads every MDX file under content/blog and content/learn/<series>, maps each
 * tag in the `tags:` frontmatter line through the SYNONYM→canonical merge map,
 * rewrites the line in place (preserving the inline `[a, b]` array format the
 * build scripts parse), and reports any tag it couldn't map.
 *
 * Run:  node scripts/apply-tag-vocab.js
 * Then: npm run prebuild   (regenerates src/data/posts.ts + src/data/learn.ts)
 *
 * The canonical vocabulary + definitions live in src/lib/tag-vocab.ts. Add
 * entries here (and to TAG_DEFINITIONS there) when a genuinely new topic
 * arrives — the cap is editorial, not enforced by this script.
 */

const fs = require("fs");
const path = require("path");

const BLOG_DIR = path.join(__dirname, "..", "content", "blog");
const LEARN_DIR = path.join(__dirname, "..", "content", "learn");

/**
 * Tag → canonical merge map. Keys are every non-canonical tag observed in
 * content; values are the canonical tag to merge into. A value of null drops
 * the tag entirely (generic tags with no topical value).
 */
const MERGE = {
  // AI / agents
  A2A: "AI Agents", "Agent Frameworks": "AI Agents", "Agent Identity": "AI Agents",
  "Agent Memory": "AI Agents", Agentforce: "AI Agents", "Agentic AI": "AI Agents",
  Agentic: "AI Agents", CrewAI: "AI Agents", LangGraph: "AI Agents",
  "Microsoft Agent Framework": "AI Agents", "Multi-Agent": "AI Agents",
  "Multi-Agent Orchestration": "AI Agents", "Multi-Agent Systems": "AI Agents",
  "Multi-agent": "AI Agents", "Persistent Memory": "AI Agents", Tools: "AI Agents",
  "LLM Tool Integration": "AI Agents", Memory: "AI Agents", "Hermes Agent": "AI Agents",
  "Agentic UI": "AI at Work", "Generative UI": "AI at Work", A2UI: "AI at Work",
  "AI Strategy": "AI at Work", "AI Literacy": "AI at Work", "AI Patterns": "AI at Work",
  "AI at Work": "AI at Work", Workplace: "AI at Work", "AI-Generated Code": "AI at Work",
  // LLMs / infra
  AI: "LLMs", LLM: "LLMs", Models: "LLMs", "LLM Evals": "LLMs", Evaluation: "LLMs",
  "AI Infrastructure": "AI Infrastructure", "LLM Infrastructure": "AI Infrastructure",
  "LLM Inference": "AI Infrastructure", "LLM Serving": "AI Infrastructure",
  Inference: "AI Infrastructure", "Model Serving": "AI Infrastructure",
  "Model Registry": "AI Infrastructure", MLOps: "AI Infrastructure", GPU: "AI Infrastructure",
  SGLang: "AI Infrastructure", vLLM: "AI Infrastructure", "Local Models": "AI Infrastructure",
  Qwen: "AI Infrastructure",
  "Context Engineering": "Prompt Engineering", Context: "Prompt Engineering",
  Prompting: "Prompt Engineering", "Prompt Engineering": "Prompt Engineering",
  "Model Context Protocol": "MCP", MCP: "MCP",
  Retrieval: "RAG", Reranking: "RAG", "Hybrid Search": "RAG", Embeddings: "RAG",
  Chunking: "RAG", "Vector Database": "RAG", "Vector Databases": "RAG",
  Indexes: "RAG", Indexing: "RAG", "RAG Evaluation": "RAG", RAG: "RAG",
  // Salesforce platform
  Salesforce: "Salesforce", Apex: "Apex", "Data Cloud": "Data Cloud", CDP: "Data Cloud",
  "Data 360": "Data Cloud", "Identity Resolution": "Data Cloud", Personalization: "Data Cloud",
  "Change Data Capture": "Data Cloud", CDC: "Data Cloud", Flow: "Flow", "Flow Automation": "Flow",
  "Flow Metrics": "Flow", "Flow Orchestration": "Flow", OmniStudio: "OmniStudio",
  OmniScripts: "OmniStudio", FlexCards: "OmniStudio", Certificates: "OmniStudio",
  Certifications: "OmniStudio", "OmniStudio Fundamentals": "OmniStudio",
  "Experience Cloud": "Salesforce", Communities: "Salesforce", "Big Objects": "Salesforce",
  "Large Data Volumes": "Salesforce", "Platform Cache": "Salesforce",
  "Platform Events": "Salesforce", SOQL: "Salesforce", "Salesforce DX": "Salesforce",
  Sandboxes: "Salesforce", Sessions: "Salesforce", Sharing: "Salesforce",
  Foundations: "Salesforce", Limits: "Salesforce", "Summer '26": "Salesforce",
  // web / react
  React: "React", Hooks: "React", useCallback: "React", useMemo: "React",
  Mutations: "React", "React Compiler": "React", "Server Components": "React",
  "Server Actions": "React", "Next.js": "Next.js", TypeScript: "TypeScript",
  "shadcn/ui": "Design Systems", shadcn: "Design Systems",
  CSS: "Web Development", "Web Forms": "Web Development", "Real-Time": "Web Development",
  "Real-time": "Web Development", Realtime: "Web Development", WebSockets: "Web Development",
  SSE: "Web Development", Streaming: "Web Development", Supabase: "Web Development",
  Postgres: "Web Development", Compilers: "Web Development", W3C: "Web Development",
  "Web Development": "Web Development",
  // design / ui-ux
  "Design Systems": "Design Systems", "Design Tokens": "Design Systems",
  DTCG: "Design Systems", Storybook: "Design Systems", Radix: "Design Systems",
  "Base UI": "Design Systems", "React Aria": "Design Systems", shadcn: "Design Systems",
  "Component Libraries": "Design Systems", "Interface Patterns": "Design Systems",
  "Design-to-Code": "Design Systems", Figma: "Design Systems",
  "Headless UI": "Design Systems", "Design Engineering": "UI/UX",
  "Design Research": "UI/UX", UX: "UI/UX", UI: "UI/UX", "User Research": "UI/UX",
  "UX Research": "UI/UX", ResearchOps: "UI/UX", "Form UX": "UI/UX",
  "Inline Validation": "UI/UX", "Dark Mode": "UI/UX", Editing: "UI/UX",
  Research: "UI/UX", Accessibility: "Accessibility", WCAG: "Accessibility",
  // devops / platform
  DevOps: "DevOps", "CI/CD": "CI/CD", CI: "CI/CD", CD: "CI/CD",
  "GitHub Actions": "CI/CD", GitLab: "CI/CD", "Merge Queue": "CI/CD",
  "Trunk-Based Development": "CI/CD", GitHub: "DevOps",
  "Infrastructure as Code": "Platform Engineering", IaC: "Platform Engineering",
  Terraform: "Platform Engineering", OpenTofu: "Platform Engineering",
  Kubernetes: "Kubernetes", Cilium: "Platform Engineering", Tetragon: "Platform Engineering",
  eBPF: "Platform Engineering", Crossplane: "Platform Engineering",
  "Gateway API": "Platform Engineering", "Control Plane": "Platform Engineering",
  "Platform Engineering": "Platform Engineering", Middleware: "Platform Engineering",
  "Developer Productivity": "Platform Engineering", "Code Connect": "Platform Engineering",
  Observability: "Observability", OpenTelemetry: "Observability", Telemetry: "Observability",
  "Debug Logs": "Observability", Monitoring: "Observability", "Event Monitoring": "Observability",
  // delivery / testing / security
  Delivery: "Delivery", Deployment: "Delivery", Environments: "Delivery",
  Production: "Delivery", "Spec-Driven Development": "Delivery",
  "Change Sets": "Delivery", "Code Review": "Delivery",
  Testing: "Testing", Playwright: "Testing", "Visual Regression Testing": "Testing",
  "Regression Testing": "Testing", "Testing Center": "Testing", Quality: "Testing",
  "Synthetic Users": "Testing",
  Security: "Security", security: "Security", "AI Security": "Security", "Prompt Injection": "Security",
  "Tool Poisoning": "Security", IAM: "Security", Authentication: "Security",
  Compliance: "Security", "Supply Chain Security": "Security", DevSecOps: "Security",
  Identity: "Security", OAuth: "Security", SAML: "Security", JWT: "Security",
  Permissions: "Security", Safety: "Security", "Data Safety": "Security",
  // architecture / data / governance
  Architecture: "Architecture", Architect: "Architecture", "Systems Architecture": "Architecture",
  "Solution Design": "Architecture", "Architecture Documentation": "Architecture",
  "Architecture Review": "Architecture", "Composable Architecture": "Architecture",
  "Cross-Pillar": "Architecture", Complexity: "Architecture", Frameworks: "Architecture",
  Patterns: "Architecture", NFRs: "Architecture", "State of the Stack": "Architecture",
  Cynefin: "Architecture", "Multi-Tenancy": "Architecture",
  Data: "Data", "Data Architecture": "Data", "Data Model": "Data",
  "Data Migration": "Data", "Data 360": "Data", "Change Data Capture": "Data",
  ETL: "Data", ELT: "Data", BigQuery: "Data", "Large Data Volumes": "Data",
  "Identity Resolution": "Data",
  Governance: "Governance", "Decision Records": "Governance",
  // project mgmt / consulting / reliability / perf / integration / automation / agile
  "Project Management": "Project Management", PMI: "Project Management",
  "PM Tooling": "Project Management", Requirements: "Project Management",
  "Stakeholder Management": "Project Management", Estimation: "Project Management",
  Meetings: "Project Management", Pacing: "Project Management",
  Consulting: "Consulting", "Business Growth": "Consulting", Discovery: "Consulting",
  Communication: "Consulting", "Problem-Solving": "Consulting",
  "Digital Transformation": "Digital Transformation", Enterprise: "Enterprise",
  Agile: "Agile", Scrum: "Agile", Retrospective: "Agile", "Sprint Review": "Agile",
  "Definition of Done": "Agile", "Continuous Improvement": "Agile", Iteration: "Agile",
  Reliability: "Reliability", "Error Handling": "Reliability", "Failure Modes": "Reliability",
  "Eventual Consistency": "Reliability", "Production Patterns": "Reliability",
  Performance: "Performance", Latency: "Performance", Throughput: "Performance",
  Cost: "Performance", "Cost Optimization": "Performance", FinOps: "Performance",
  TCO: "Performance", Batching: "Performance", Caching: "Performance",
  Integration: "Integration", "Integration Patterns": "Integration",
  "Integration Procedures": "Integration", Interoperability: "Integration",
  "Named Credentials": "Integration", "Platform Events": "Integration",
  Asynchronous: "Integration", Pub: "Integration", Queues: "Integration",
  REST: "Integration", "Sub API": "Integration", "Pub/Sub API": "Integration", EAA: "Integration",
  Orchestration: "Orchestration", Automation: "Automation",

  // dropped — generic / no topical value
  General: null, Learn: null,
};

function slugify(tag) { return tag.toLowerCase().replace(/\s+/g, "-"); }
const CANONICALS = new Set(Object.values(MERGE).filter(Boolean));

function canonicalizeTag(tag) {
  if (CANONICALS.has(tag)) return tag; // already canonical
  return Object.prototype.hasOwnProperty.call(MERGE, tag) ? MERGE[tag] : undefined;
}

/** Rewrite the tags: line in a frontmatter block. Returns [newFmBlock, changed]. */
function rewriteTags(fmBlock) {
  if (!fmBlock.startsWith("---")) return [fmBlock, false];
  const lines = fmBlock.split("\n");
  const tagIdx = lines.findIndex((l) => /^\s*tags\s*:/.test(l));
  if (tagIdx === -1) return [fmBlock, false];
  const line = lines[tagIdx];
  const ci = line.indexOf(":");
  const before = line.slice(0, ci + 1).trim(); // "tags:"
  const rawVal = line.slice(ci + 1).trim();
  let tags = [];
  if (rawVal.startsWith("[")) {
    tags = rawVal
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  } else {
    tags = [rawVal.replace(/^["']|["']$/g, "")];
  }
  const mapped = [];
  const unknown = [];
  for (const t of tags) {
    const c = canonicalizeTag(t);
    if (c === null) continue; // dropped
    if (c === undefined) { unknown.push(t); mapped.push(t); }
    else if (!mapped.includes(c)) mapped.push(c); // dedupe
  }
  lines[tagIdx] = `${before} [${mapped.join(", ")}]`;
  return [lines.join("\n"), true];
}

function processDir(dir, prefix, stats) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort()) {
    const p = path.join(dir, file);
    const raw = fs.readFileSync(p, "utf-8");
    const end = raw.indexOf("\n---", 3);
    if (end === -1) continue;
    const fm = raw.slice(0, end + 4);
    const rest = raw.slice(end + 4);
    const [newFm, changed] = rewriteTags(fm);
    if (changed) {
      fs.writeFileSync(p, newFm + rest);
      stats.changed++;
    }
    stats.seen++;
  }
}

const stats = { seen: 0, changed: 0 };
processDir(BLOG_DIR, "blog", stats);
for (const series of fs.readdirSync(LEARN_DIR).filter((d) => !d.startsWith("."))) {
  processDir(path.join(LEARN_DIR, series), `learn/${series}`, stats);
}
console.log(`Scanned ${stats.seen} MDX files, rewrote tags in ${stats.changed}.`);
console.log(`Canonical vocabulary: ${CANONICALS.size} tags.`);
