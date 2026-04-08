import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Web Development",
  description:
    "Enterprise web development: strategy, design, front-end build, CMS delivery, and CRM integration.",
};

const MODULES = [
  {
    title: "Strategy & Information Architecture",
    items: [
      "Audience and messaging alignment",
      "Conversion-oriented page structures",
      "Content hierarchy and navigation design",
    ],
  },
  {
    title: "Design & Front-End Development",
    items: [
      "Premium visual language with accessible UX",
      "Responsive component systems",
      "Performance optimization for Core Web Vitals",
    ],
  },
  {
    title: "CMS & Platform Delivery",
    items: [
      "React/Next.js, WordPress, or Salesforce Experience Cloud implementation",
      "Authoring workflows and content governance",
      "SEO, analytics, and consent instrumentation",
    ],
  },
  {
    title: "Integration & Operations",
    items: [
      "CRM lead capture integration (Salesforce Web-to-Lead, API, or middleware)",
      "Forms, automation, and routing pipelines",
      "Hosting, release management, and support model",
    ],
  },
];

const OUTCOMES = [
  "Stronger executive-level brand perception",
  "Higher quality inbound conversion flows",
  "Lower content publishing friction for internal teams",
  "Cleaner handoff from marketing to sales operations",
];

export default function WebDevelopment() {
  return (
    <>
      <HeroSection
        title="Enterprise Web Development Built for Performance and Credibility"
        subtitle="We create secure, modern websites that communicate authority, generate qualified demand, and integrate with your business systems."
        primaryCta={{
          label: "Discuss Your Web Project",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Your Website as a Strategic Business Asset
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              Your website should function as both a strategic brand asset and an
              operational system. Adroit designs and builds sites that are fast,
              maintainable, and aligned with enterprise procurement and governance
              standards.
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
          headline="Build a web presence that reflects enterprise-grade delivery."
          ctaLabel="Request a Web Strategy Session"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
