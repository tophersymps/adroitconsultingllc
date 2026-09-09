/**
 * B-22 — Canonical tag vocabulary (discovery/consolidated-backlog.md).
 *
 * A curated ~40-tag vocabulary with a short definition per tag. Every tag in
 * content frontmatter should resolve to one of these canonicals (see
 * scripts/apply-tag-vocab.js for the synonym→canonical merge map). Definitions
 * surface on the /tags index page and (optionally) per-tag pages.
 *
 * Keep this list curated: adding a tag here is a deliberate editorial choice,
 * not a side effect of writing a post. The count is intentionally capped at
 * ~40 to keep the /tags cloud and per-tag pages meaningful (companion to B-15).
 */

export interface TagDefinition {
  tag: string;
  slug: string;
  definition: string;
}

/** Slugify a tag the same way src/lib/tags.ts does. */
function slugOf(tag: string): string {
  // Strip all non-word chars (spaces, slashes, ampersands, etc.) so single
  // and multi-word tags always produce a single URL segment (B-22: UI/UX→ui-ux).
  return tag.toLowerCase().replace(/[^\w]+/g, "-");
}

const RAW_DEFINITIONS: Array<[string, string]> = [
  ["Accessibility", "Designing and building interfaces usable by everyone, including assistive tech and WCAG conformance."],
  ["AI Agents", "Autonomous or semi-autonomous AI systems that reason, use tools, and take action to complete goals."],
  ["AI at Work", "Practical, everyday adoption of AI in real jobs — literacy, workflows, and organizational change."],
  ["AI Infrastructure", "The compute, serving, and platform layer that runs AI models and applications at scale."],
  ["Agile", "Iterative delivery practices — Scrum, ceremonies, estimation, and continuous improvement."],
  ["Apex", "Salesforce's server-side programming language — classes, triggers, and platform limits."],
  ["Architecture", "System and solution design — trade-offs, patterns, and the decisions behind them."],
  ["Automation", "Replacing manual work with flows, pipelines, and orchestrated processes."],
  ["CI/CD", "Continuous integration and continuous delivery — pipelines, merge queues, and trunk-based development."],
  ["Consulting", "Advisory and delivery craft — client work, discovery, and turning expertise into outcomes."],
  ["Data", "Data engineering and modeling — pipelines, storage, ETL/ELT, and data quality."],
  ["Data Cloud", "Salesforce Data Cloud — customer 360, identity resolution, and personalization."],
  ["Delivery", "Getting work shipped reliably — deployments, environments, and release discipline."],
  ["Design Systems", "Reusable component libraries, tokens, and the governance that keeps UIs consistent."],
  ["DevOps", "The culture and tooling bridging development and operations."],
  ["Digital Transformation", "Modernizing how organizations operate with new technology."],
  ["Enterprise", "Patterns, constraints, and scale concerns specific to large organizations."],
  ["Flow", "Salesforce Flow — automation, orchestration, and the declarative tooling around it."],
  ["Governance", "Standards, guardrails, and decision records that keep teams aligned."],
  ["Integration", "Connecting systems — APIs, middleware, eventing, and platform integrations."],
  ["Kubernetes", "Container orchestration and the cloud-native platform layer around it."],
  ["LLMs", "Large language models — behavior, evaluation, prompting, and reliability."],
  ["MCP", "Model Context Protocol — the open standard for connecting AI agents to tools and data."],
  ["Next.js", "The React framework — app router, server components, and full-stack conventions."],
  ["Observability", "Understanding system behavior through logs, metrics, traces, and monitoring telemetry."],
  ["OmniStudio", "Salesforce's low-code toolkit for declarative apps, data, and documents."],
  ["Orchestration", "Coordinating multiple services, agents, or pipelines into a coherent workflow."],
  ["Performance", "Speed, latency, throughput, and cost — measured and optimized."],
  ["Platform Engineering", "Building and operating internal developer platforms — IaC, gateways, and control planes."],
  ["Project Management", "Planning, estimating, and steering work to completion with stakeholders."],
  ["Prompt Engineering", "Designing effective prompts and context for reliable model behavior."],
  ["RAG", "Retrieval-augmented generation — grounding model answers in your own data."],
  ["React", "The React library — hooks, rendering, and component architecture."],
  ["Reliability", "Resilience, failure handling, and keeping systems working under stress."],
  ["Salesforce", "The Salesforce platform — core, architecture, and ecosystem."],
  ["Security", "Protecting systems and data — auth, threat modeling, and supply chain."],
  ["Testing", "Verifying behavior — unit, integration, visual, and regression testing."],
  ["TypeScript", "Typed JavaScript — types, inference, and compile-time safety."],
  ["UI/UX", "Interface and experience design — research, usability, and visual craft."],
  ["Web Development", "Building for the web — forms, streaming, real-time, and browser APIs."],
];

export const TAG_DEFINITIONS: TagDefinition[] = RAW_DEFINITIONS.map(
  ([tag, definition]) => ({ tag, slug: slugOf(tag), definition }),
);

/** Look up a canonical tag definition by tag name. */
export function getTagDefinition(tag: string): TagDefinition | undefined {
  return TAG_DEFINITIONS.find((d) => d.tag === tag);
}

/** Map of canonical tag → definition, for quick display. */
export const TAG_DEFINITION_MAP: Record<string, string> =
  Object.fromEntries(TAG_DEFINITIONS.map((d) => [d.tag, d.definition]));
