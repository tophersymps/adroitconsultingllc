import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import HeroSection from "@/components/Marketing/sections/HeroSection";
import SectionContainer from "@/components/Marketing/sections/SectionContainer";
import ServiceModule from "@/components/Marketing/sections/ServiceModule";
import CTABlock from "@/components/Marketing/sections/CTABlock";
import ScrollReveal from "@/components/Marketing/effects/ScrollReveal";
import StaggerChildren from "@/components/Marketing/effects/StaggerChildren";
import MarketingPage from "@/components/Marketing/MarketingPage";

const pageSEO = buildMetadata({
  title: "Salesforce Platform Strategy",
  description:
    "Salesforce implementation, architecture, and optimization, from org design and integrations to AI readiness and Agentforce planning.",
  path: "/platform-strategy",
});

export const metadata: Metadata = {
  ...pageSEO,
  openGraph: {
    ...pageSEO.openGraph,
    type: "website",
    title: "Salesforce Platform Strategy | Adroit Consulting",
    description:
      "Salesforce architecture, integration, adoption, and AI-readiness consulting for growing businesses with real-world complexity.",
  },
};

const MODULES = [
  {
    title: "Salesforce Architecture & Roadmapping",
    items: [
      "Org assessment and platform maturity evaluation",
      "Capability gap analysis across Sales, Service, and Experience Clouds",
      "Multi-release implementation roadmap tied to business milestones",
    ],
  },
  {
    title: "Implementation & Optimization",
    items: [
      "Sales Cloud, Service Cloud, and Experience Cloud architecture",
      "Object model design and automation patterns (Flow, Apex, triggers)",
      "Legacy process redesign and technical debt reduction",
    ],
  },
  {
    title: "Integration & Data Strategy",
    items: [
      "API-led integration design (MuleSoft, middleware, direct API)",
      "Data migration, cleansing, and governance frameworks",
      "Reporting and analytics enablement (CRM Analytics, dashboards)",
    ],
  },
  {
    title: "Adoption & Governance",
    items: [
      "Role-based enablement programs and training",
      "Admin center of excellence setup",
      "Release governance, sandbox strategy, and change control",
    ],
  },
  {
    title: "AI Readiness & Agentforce",
    items: [
      "AI maturity assessment and data readiness evaluation",
      "Agentforce planning, agent design workshops, and early implementation",
      "Einstein feature enablement and predictive capability rollout",
    ],
  },
];

const OUTCOMES = [
  "A Salesforce org that evolves from system of record to system of action",
  "Faster cycle times across sales and service motions",
  "Improved data quality, reporting confidence, and decision speed",
  "Higher user adoption through process-fit design",
  "AI-ready data and architecture for Agentforce and beyond",
];

export default function PlatformStrategy() {
  return (
    <MarketingPage>
      <HeroSection
        title="Architect the Salesforce Foundation Your Business Runs On"
        subtitle="We design and implement Salesforce solutions that unify data, automate processes, and position your business for AI-driven growth."
        primaryCta={{
          label: "Schedule a Salesforce Assessment",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
              Salesforce Strategy That Connects Capability to Outcomes
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[var(--ink-muted)]">
              Adroit delivers Salesforce engagements that connect platform
              capabilities to real business processes, not just feature
              deployments. We focus on clarity in data models, automation logic,
              and user experience so teams work faster with confidence. And as
              your org matures, we help you evaluate and adopt AI capabilities
              like Agentforce so your Salesforce CRM evolves from a system of
              record to a system of action.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
            Service Modules
          </h2>
        </ScrollReveal>
        <StaggerChildren className="mt-10 grid gap-8 md:grid-cols-2" stagger={0.12}>
          {MODULES.map((m) => (
            <ScrollReveal key={m.title} direction="up">
              <ServiceModule {...m} />
            </ScrollReveal>
          ))}
        </StaggerChildren>
      </SectionContainer>

      <SectionContainer>
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
            Outcomes
          </h2>
        </ScrollReveal>
        <StaggerChildren className="mt-8 grid gap-4 md:grid-cols-2" stagger={0.1}>
          {OUTCOMES.map((item) => (
            <ScrollReveal key={item} direction="left">
              <div className="flex items-start gap-3 text-lg text-[var(--ink-muted)]">
                <svg className="mt-1 h-6 w-6 flex-shrink-0 text-[var(--accent-band)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{item}</span>
              </div>
            </ScrollReveal>
          ))}
        </StaggerChildren>
      </SectionContainer>

      <ScrollReveal direction="none">
        <CTABlock
          headline="Build a Salesforce org your teams actually use, and that gets smarter over time."
          ctaLabel="Request a Salesforce Assessment"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </MarketingPage>
  );
}
