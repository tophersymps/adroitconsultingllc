import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import HeroSection from "@/components/Marketing/sections/HeroSection";
import SectionContainer from "@/components/Marketing/sections/SectionContainer";
import ServiceCard from "@/components/Marketing/sections/ServiceCard";
import CTABlock from "@/components/Marketing/sections/CTABlock";
import ScrollReveal from "@/components/Marketing/effects/ScrollReveal";
import StaggerChildren from "@/components/Marketing/effects/StaggerChildren";
import MarketingPage from "@/components/Marketing/MarketingPage";

const pageSEO = buildMetadata({
  title: "Adroit Consulting",
  description:
    "Adroit Consulting modernizes operations through Salesforce strategy, intelligent automation, and AI-enhanced digital experiences built for growing businesses.",
  path: "/",
});

export const metadata: Metadata = {
  ...pageSEO,
  openGraph: {
    ...pageSEO.openGraph,
    type: "website",
    title: "Adroit Consulting: Modern Operations for Growing Businesses",
    description:
      "Salesforce platform strategy, operational intelligence, and digital experience consulting for organizations modernizing with AI, at a pace that fits the business.",
  },
};

function PlatformIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  );
}

function IntelligenceIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ExperienceIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

const PILLARS = [
  {
    title: "Salesforce Platform Strategy",
    description:
      "Architect your Salesforce foundation: implementation, integration, and AI readiness from Agentforce to day-to-day operations.",
    href: "/platform-strategy",
    icon: <PlatformIcon />,
  },
  {
    title: "Operational Intelligence",
    description:
      "Replace manual effort with intelligent automation, AI-augmented workflows, and real-time visibility.",
    href: "/operational-intelligence",
    icon: <IntelligenceIcon />,
  },
  {
    title: "Digital Experience",
    description:
      "Build secure, performant digital experiences that earn trust, drive conversion, and connect to your systems.",
    href: "/digital-experience",
    icon: <ExperienceIcon />,
  },
];

const WHY_ITEMS = [
  {
    title: "Outcome-Driven Architecture",
    description:
      "Every technical decision is tied to a measurable business outcome, not just a feature deployment.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "AI-Ready Delivery",
    description:
      "We build platforms and processes for AI readiness, so you can adopt Agentforce, intelligent automation, and predictive capabilities on your timeline.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
  {
    title: "Integrated Delivery",
    description:
      "Strategy, build, integration, and optimization in one engagement, with direct ownership instead of juggling disconnected vendors.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <MarketingPage>
      <HeroSection
        title="Precision Consulting for Growing Businesses"
        subtitle="Adroit Consulting modernizes operations through Salesforce strategy, intelligent automation, and AI-enhanced digital experiences that connect your systems to how your teams actually work."
        primaryCta={{
          label: "Schedule a Strategy Consultation",
          href: "/contact",
        }}
        secondaryCta={{
          label: "Explore Our Services",
          href: "#services",
        }}
        particles
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
              Strategy, build, and delivery in one engagement.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[var(--ink-muted)]">
              We work with leadership and operations teams at growing companies
              to cut process friction, ship digital initiatives faster, and build
              AI-ready systems that hold up as the business grows. Strategy,
              build, and delivery happen in one engagement, so you move from
              roadmap to measurable outcomes without juggling vendors.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray" id="services">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
              How We Help
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
              Three practice areas that work as one engagement: strategy,
              automation, and digital experience, with AI built into the
              delivery.
            </p>
          </div>
        </ScrollReveal>
        <StaggerChildren className="mt-14 grid gap-8 md:grid-cols-3" stagger={0.15}>
          {PILLARS.map((pillar) => (
            <ScrollReveal key={pillar.href} direction="up">
              <ServiceCard {...pillar} />
            </ScrollReveal>
          ))}
        </StaggerChildren>
      </SectionContainer>

      <SectionContainer>
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
              Why Adroit
            </h2>
          </div>
        </ScrollReveal>
        <StaggerChildren className="mt-14 grid gap-10 md:grid-cols-3" stagger={0.15}>
          {WHY_ITEMS.map((item) => (
            <ScrollReveal key={item.title} direction="up">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-icon-chip)] text-[var(--ink-icon-chip)]">
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[var(--ink-heading)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-[var(--ink-muted)]">
                  {item.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </StaggerChildren>
        <ScrollReveal delay={0.3}>
          <p className="mx-auto mt-16 max-w-3xl text-center text-lg leading-relaxed text-[var(--ink-muted)]">
            We deliver platforms and processes that cut execution time, raise
            user adoption, and reduce operational overhead, with AI built in,
            not bolted on.
          </p>
        </ScrollReveal>
      </SectionContainer>

      <ScrollReveal direction="none">
        <CTABlock
          headline="Fragmented systems or coordinated execution. Which one are you running?"
          body="Book a 45-minute discovery session. We'll map your current-state constraints and outline a practical modernization path."
          ctaLabel="Book Discovery Session"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </MarketingPage>
  );
}
