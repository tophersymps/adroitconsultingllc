import HeroSection from "@/components/sections/HeroSection";
import SectionContainer from "@/components/sections/SectionContainer";
import ServiceCard from "@/components/sections/ServiceCard";
import CTABlock from "@/components/sections/CTABlock";
import ScrollReveal from "@/components/effects/ScrollReveal";
import StaggerChildren from "@/components/effects/StaggerChildren";

function CloudIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

const PILLARS = [
  {
    title: "Salesforce Consulting",
    description:
      "Design and implement Salesforce ecosystems aligned to your operating model.",
    href: "/salesforce-consulting",
    icon: <CloudIcon />,
  },
  {
    title: "Business Process Automation",
    description:
      "Replace manual handoffs with intelligent workflows and integrations.",
    href: "/business-process-automation",
    icon: <CogIcon />,
  },
  {
    title: "Web Development",
    description:
      "Build secure, performant, conversion-driven digital experiences for enterprise audiences.",
    href: "/web-development",
    icon: <CodeIcon />,
  },
];

const WHY_ITEMS = [
  {
    title: "Business-First Architecture",
    description: "Every technical decision is tied to an operational KPI.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "Cross-Functional Delivery",
    description:
      "Strategy, build, integration, and optimization under one team.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    title: "Enterprise Readiness",
    description:
      "Governance, security, data integrity, and long-term maintainability.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <>
      <HeroSection
        title="Transform Enterprise Performance with Precision Consulting"
        subtitle="Adroit Consulting helps organizations modernize operations through Salesforce implementation, business process automation, and high-performance web development."
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

      {/* Value Proposition */}
      <SectionContainer>
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Strategic Guidance. Technical Architecture. Delivery Discipline.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-slate">
              We partner with enterprise teams to eliminate process friction,
              accelerate digital initiatives, and build systems that scale. Our
              engagements combine strategic guidance, technical architecture, and
              delivery discipline to move from roadmap to measurable business
              outcomes.
            </p>
          </div>
        </ScrollReveal>
      </SectionContainer>

      {/* Service Pillars */}
      <SectionContainer bg="gray" id="services">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Core Services
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate">
              Three integrated practice areas delivering measurable enterprise
              outcomes.
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

      {/* Why Adroit */}
      <SectionContainer>
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-charcoal sm:text-4xl">
              Why Adroit
            </h2>
          </div>
        </ScrollReveal>
        <StaggerChildren className="mt-14 grid gap-10 md:grid-cols-3" stagger={0.15}>
          {WHY_ITEMS.map((item) => (
            <ScrollReveal key={item.title} direction="up">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-navy/10 text-navy">
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-charcoal">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate">
                  {item.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </StaggerChildren>
        <ScrollReveal delay={0.3}>
          <p className="mx-auto mt-16 max-w-3xl text-center text-lg leading-relaxed text-slate">
            We deliver platforms that improve speed-to-execution, increase user
            adoption, and reduce operational overhead across revenue, service, and
            back-office functions.
          </p>
        </ScrollReveal>
      </SectionContainer>

      <ScrollReveal direction="none">
        <CTABlock
          headline="Ready to move from fragmented systems to coordinated execution?"
          body="Book a 45-minute discovery session. We'll map your current-state constraints and outline a practical modernization path."
          ctaLabel="Book Discovery Session"
          ctaHref="/contact"
        />
      </ScrollReveal>
    </>
  );
}
