import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Salesforce Consulting",
  description:
    "Enterprise Salesforce consulting: strategy, implementation, integration, and adoption for complex environments.",
};

const MODULES = [
  {
    title: "Salesforce Strategy & Roadmapping",
    items: [
      "Org assessment and maturity evaluation",
      "Capability gap analysis across clouds",
      "Multi-release implementation roadmap",
    ],
  },
  {
    title: "Implementation & Optimization",
    items: [
      "Sales Cloud, Service Cloud, Experience Cloud architecture",
      "Object model design and automation patterns (Flow, Apex, triggers)",
      "Legacy process redesign inside Salesforce",
    ],
  },
  {
    title: "Integration & Data",
    items: [
      "API-led integration strategy (MuleSoft, middleware, direct API)",
      "Data migration, cleansing, and governance",
      "Reporting and analytics enablement (CRM Analytics, dashboards)",
    ],
  },
  {
    title: "Adoption & Governance",
    items: [
      "Role-based enablement programs",
      "Admin center of excellence setup",
      "Release governance, sandbox strategy, and change control",
    ],
  },
];

const OUTCOMES = [
  "Faster cycle times across sales and service motions",
  "Improved data quality and reporting confidence",
  "Better user adoption through process-fit design",
  "Lower long-term admin and support burden",
];

export default function SalesforceConsulting() {
  return (
    <>
      <HeroSection
        title="Salesforce Consulting for Complex Enterprise Environments"
        subtitle="From architecture to adoption, we build Salesforce solutions that support growth, compliance, and operational excellence."
        primaryCta={{
          label: "Talk to a Salesforce Architect",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Platform Capabilities Connected to Real Business Processes
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              Adroit Consulting delivers Salesforce programs that connect platform
              capabilities to real business processes&nbsp;&mdash; not just feature
              deployments. We focus on clarity in data models, automation logic, and
              user experience so teams can work faster with confidence.
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
              <li className="flex items-start gap-3 text-lg text-slate list-none">
                <svg className="mt-1 h-6 w-6 flex-shrink-0 text-carmine" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{item}</span>
              </li>
            </ScrollReveal>
          ))}
        </StaggerChildren>
      </SectionContainer>

      <ScrollReveal direction="none">
        <CTABlock
          headline="Build a Salesforce platform your teams actually use."
          ctaLabel="Request a Salesforce Assessment"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
