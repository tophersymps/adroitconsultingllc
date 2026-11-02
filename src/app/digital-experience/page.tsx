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
  title: "Digital Experience",
  description:
    "Build digital experiences that drive conversion and connect directly to your operational systems, backed by AI-enhanced personalization.",
  path: "/digital-experience",
});

export const metadata: Metadata = {
  ...pageSEO,
  openGraph: {
    ...pageSEO.openGraph,
    type: "website",
    title: "Digital Experience | Adroit Consulting",
    description:
      "Professional web development, Salesforce-integrated digital experiences, and AI-enhanced UX for businesses that need more than a brochure site.",
  },
};

const MODULES = [
  {
    title: "Strategy & Information Architecture",
    items: [
      "Audience and messaging alignment for your key buyers",
      "Conversion-oriented page structures and user flows",
      "Content hierarchy, navigation design, and SEO foundations",
    ],
  },
  {
    title: "Design & Front-End Development",
    items: [
      "Distinctive visual design with accessible, responsive UX",
      "Component systems built for maintainability and scale",
      "Performance optimization for Core Web Vitals and mobile",
    ],
  },
  {
    title: "CMS & Platform Delivery",
    items: [
      "React/Next.js, WordPress, or Salesforce Experience Cloud",
      "Authoring workflows and content governance",
      "SEO, analytics, and consent instrumentation",
    ],
  },
  {
    title: "Integration & Operations",
    items: [
      "Lead capture into Salesforce (Web-to-Lead, API, or middleware)",
      "Forms, automation pipelines, and routing logic",
      "Hosting, release management, and ongoing support model",
    ],
  },
  {
    title: "AI-Enhanced Experiences",
    items: [
      "Intelligent search and content recommendations",
      "Personalized user journeys based on behavior and context",
      "Chatbot integration and AI-driven conversion optimization",
    ],
  },
];

const OUTCOMES = [
  "Stronger brand perception and credibility with your buyers",
  "Higher quality inbound leads through optimized conversion flows",
  "Lower content publishing friction for internal teams",
  "Clean handoff from marketing to sales operations via Salesforce integration",
  "Digital experiences that personalize to each visitor and hold their performance under real traffic",
];

export default function DigitalExperience() {
  return (
    <MarketingPage>
      <HeroSection
        title="Build Digital Experiences That Drive Conversion and Connect to Your Systems"
        subtitle="We build secure, performant digital experiences that generate qualified demand and connect directly to your business systems."
        primaryCta={{
          label: "Discuss Your Digital Strategy",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
              Your Digital Presence as a Business Asset
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[var(--ink-muted)]">
              Your digital experience should work as both a brand asset and an
              operational system. Adroit designs and builds experiences that stay fast under load and are maintainable, with the security and governance your business requires. We build sites that do more than inform: they
              adapt, personalize, and connect directly to your operational
              systems.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer bg="gray">
        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--ink-heading)] sm:text-4xl">
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
          headline="Build a digital presence backed by the same delivery process we hold ourselves to on every build."
          ctaLabel="Request a Digital Strategy Session"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </MarketingPage>
  );
}
