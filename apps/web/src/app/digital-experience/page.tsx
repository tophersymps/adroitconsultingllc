import type { Metadata } from "next";
import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceModule from "@/components/sections/ServiceModule";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

export const metadata: Metadata = {
  title: "Digital Experience",
  description:
    "Build digital experiences that earn trust, drive conversion, and connect directly to your operational systems — with AI-enhanced personalization and performance.",
  openGraph: {
    title: "Digital Experience | Adroit Consulting",
    description:
      "Enterprise web development, CRM-integrated digital experiences, and AI-enhanced UX for organizations that need more than a website.",
  },
};

const MODULES = [
  {
    title: "Strategy & Information Architecture",
    items: [
      "Audience and messaging alignment for executive buyers",
      "Conversion-oriented page structures and user flows",
      "Content hierarchy, navigation design, and SEO foundations",
    ],
  },
  {
    title: "Design & Front-End Development",
    items: [
      "Premium visual language with accessible, responsive UX",
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
      "CRM lead capture (Salesforce Web-to-Lead, API, or middleware)",
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
  "Stronger executive-level brand perception and credibility",
  "Higher quality inbound leads through optimized conversion flows",
  "Lower content publishing friction for internal teams",
  "Seamless handoff from marketing to sales operations via CRM integration",
  "Digital experiences that adapt, personalize, and perform",
];

export default function DigitalExperience() {
  return (
    <>
      <HeroSection
        title="Build Digital Experiences That Earn Trust and Drive Conversion"
        subtitle="We create secure, performant digital experiences that communicate authority, generate qualified demand, and connect directly to your business systems."
        primaryCta={{
          label: "Discuss Your Digital Strategy",
          href: "/contact",
        }}
        compact
      />

      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Your Digital Presence as a Strategic Business Asset
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              Your digital experience should function as both a strategic brand
              asset and an operational system. Adroit designs and builds
              experiences that are fast, maintainable, and aligned with
              enterprise procurement and governance standards. We build sites
              that do more than inform&nbsp;&mdash; they adapt, personalize, and
              connect directly to your operational systems.
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
          headline="Build a digital presence that reflects enterprise-grade delivery."
          ctaLabel="Request a Digital Strategy Session"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
