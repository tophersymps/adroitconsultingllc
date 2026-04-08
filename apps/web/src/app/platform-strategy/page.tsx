import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Platform & CRM Strategy",
  description:
    "Architect the CRM and platform foundation your business runs on — from Salesforce implementation and optimization to AI readiness and Agentforce planning.",
  openGraph: {
    title: "Platform & CRM Strategy | Adroit Consulting",
    description:
      "Salesforce architecture, integration, adoption, and AI-readiness consulting for complex enterprise environments.",
  },
};

const MODULES = [
  {
    title: "CRM Architecture & Roadmapping",
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
  "A CRM platform that evolves from system of record to system of action",
  "Faster cycle times across sales and service motions",
  "Improved data quality, reporting confidence, and decision speed",
  "Higher user adoption through process-fit design",
  "AI-ready data and architecture for Agentforce and beyond",
];

export default function PlatformStrategy() {
  return (
    <>
      <HeroSection
        title="Architect the Systems Your Business Runs On"
        subtitle="We design and implement CRM platforms that unify data, automate processes, and position your organization for AI-driven growth."
        primaryCta={{
          label: "Schedule a Platform Assessment",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Platform Strategy That Connects Capability to Outcomes
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              Adroit delivers CRM programs that connect platform capabilities to
              real business processes&nbsp;&mdash; not just feature deployments.
              We focus on clarity in data models, automation logic, and user
              experience so teams work faster with confidence. And as your
              platform matures, we help you evaluate and adopt AI capabilities
              like Agentforce so your CRM evolves from a system of record to a
              system of action.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
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
          <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
            Outcomes
          </h2>
        </ScrollReveal>
        <StaggerChildren className="mt-8 grid gap-4 md:grid-cols-2" stagger={0.1}>
          {OUTCOMES.map((item) => (
            <ScrollReveal key={item} direction="left">
              <div className="flex items-start gap-3 text-lg text-slate">
                <svg className="mt-1 h-6 w-6 flex-shrink-0 text-carmine" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
          headline="Build a platform your teams actually use — and that gets smarter over time."
          ctaLabel="Request a Platform Assessment"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
