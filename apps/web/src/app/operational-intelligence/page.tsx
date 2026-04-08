import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Operational Intelligence",
  description:
    "Turn process complexity into operational advantage with intelligent automation, cross-system integration, AI-augmented workflows, and real-time operational analytics.",
  openGraph: {
    title: "Operational Intelligence | Adroit Consulting",
    description:
      "Workflow automation, AI-augmented processes, and operational analytics for enterprises ready to operate smarter.",
  },
};

const MODULES = [
  {
    title: "Process Discovery & Prioritization",
    items: [
      "Current-state workflow mapping and stakeholder interviews",
      "ROI-based automation sequencing and opportunity scoring",
      "Risk, control, and compliance assessment",
    ],
  },
  {
    title: "Workflow Automation",
    items: [
      "Salesforce Flow, orchestration, and platform event design",
      "Approvals, routing, and exception handling patterns",
      "SLA-aware case and request management",
    ],
  },
  {
    title: "Cross-System Integration",
    items: [
      "CRM-ERP-service desk integration architecture",
      "Event-driven process triggers and middleware design",
      "Data synchronization rules and conflict safeguards",
    ],
  },
  {
    title: "Operational Analytics",
    items: [
      "KPI dashboard design and real-time operational visibility",
      "Alerting, threshold monitoring, and escalation rules",
      "Continuous improvement feedback loops and trend analysis",
    ],
  },
  {
    title: "AI-Augmented Workflows",
    items: [
      "Intelligent document processing and data extraction",
      "AI-assisted decision routing and case classification",
      "Predictive escalation, anomaly detection, and early warning systems",
    ],
  },
];

const OUTCOMES = [
  "Reduced manual processing effort across departments",
  "Fewer operational errors and rework cycles",
  "Faster response times for internal and external stakeholders",
  "Greater process transparency and real-time visibility for leadership",
  "Intelligent systems that handle the routine and flag the exceptions",
];

export default function OperationalIntelligence() {
  return (
    <>
      <HeroSection
        title="Turn Process Complexity into Operational Advantage"
        subtitle="We design and implement intelligent automation programs that eliminate repetitive effort, embed AI where it matters, and give your teams real-time visibility into what's working."
        primaryCta={{
          label: "Start an Operations Review",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Automation That Improves Decisions, Not Just Tasks
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              Automation is most valuable when it improves decision quality and
              execution speed&nbsp;&mdash; not just task completion. Adroit maps
              processes end-to-end, identifies high-friction bottlenecks, and
              builds automation that is reliable, observable, and scalable. We
              embed intelligence into your workflows so systems can handle the
              routine, flag the exceptions, and surface the insights your teams
              need to act.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
            Capabilities
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
          headline="Stop managing complexity — start leveraging it."
          ctaLabel="Book an Operational Intelligence Workshop"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
