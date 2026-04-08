import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Business Process Automation",
  description:
    "Enterprise automation consulting: process discovery, workflow automation, cross-system integration, and operational intelligence.",
};

const MODULES = [
  {
    title: "Process Discovery & Prioritization",
    items: [
      "Current-state workflow mapping and stakeholder interviews",
      "ROI-based automation sequencing",
      "Risk and control assessment",
    ],
  },
  {
    title: "Workflow Automation",
    items: [
      "Salesforce Flow and orchestration design",
      "Approvals, routing, and exception handling",
      "SLA-aware case and request management",
    ],
  },
  {
    title: "Cross-System Automation",
    items: [
      "CRM-ERP-service desk integrations",
      "Event-driven process triggers",
      "Data synchronization rules and safeguards",
    ],
  },
  {
    title: "Operational Intelligence",
    items: [
      "KPI dashboard design and real-time visibility",
      "Alerting and threshold monitoring",
      "Continuous improvement feedback loops",
    ],
  },
];

const OUTCOMES = [
  "Reduced manual processing effort across departments",
  "Fewer operational errors and rework cycles",
  "Faster response times for internal and external stakeholders",
  "Greater process transparency for leadership teams",
];

export default function BusinessProcessAutomation() {
  return (
    <>
      <HeroSection
        title="Automate the Work That Slows Your Business Down"
        subtitle="We design and implement automation programs that eliminate repetitive effort, reduce errors, and improve throughput across your enterprise."
        primaryCta={{
          label: "Start an Automation Review",
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
              builds automation that is reliable, observable, and scalable.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
            Automation Capabilities
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
          headline="Turn process complexity into operational advantage."
          ctaLabel="Book a Process Automation Workshop"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
