/**
 * src/lib/nav.ts — single source of truth for the unified Adroit site chrome
 * (build sub-task B1, merger t_953e04ab).
 *
 * Header, Footer, and any "Back to home" CTA read labels + hrefs from this
 * SiteNavModel so the ported marketing pages and the unified chrome never
 * drift. Implements the SiteNavModel contract from @/shared/contracts.
 *
 * Key merger decisions encoded here (ADR-003, arch t_bf0336b5):
 *  - Root "/" is the marketing home (blog redirect removed).
 *  - Services render as a dropdown over the three ServiceSlug pages.
 *  - No external adroit.io self-links remain; Contact, the service pages, and
 *    Privacy are all local routes on the host.
 */
import type { SiteNavModel } from "@/shared/contracts";

export const NAV: SiteNavModel = {
  brand: {
    name: "Adroit Consulting",
    homeHref: "/",
  },
  /** Top-level desktop + mobile items in display order. */
  primary: [
    { label: "Home", href: "/" },
    { label: "Services", href: "platform-strategy" },
    { label: "Blog", href: "/blog" },
    { label: "Learn", href: "/learn" },
    { label: "Contact", href: "/contact" },
  ],
  /** Dropdown group label + the three service links (bare ServiceSlug). */
  services: {
    label: "Services",
    links: [
      { label: "Salesforce Platform Strategy", href: "platform-strategy" },
      { label: "Operational Intelligence", href: "operational-intelligence" },
      { label: "Digital Experience", href: "digital-experience" },
    ],
  },
  footer: {
    blog: [
      { label: "All Posts", href: "/blog" },
      { label: "Categories", href: "/blog/categories" },
      { label: "Tags", href: "/tags" },
      { label: "Learn", href: "/learn" },
    ],
    services: [
      { label: "Salesforce Platform Strategy", href: "platform-strategy" },
      { label: "Operational Intelligence", href: "operational-intelligence" },
      { label: "Digital Experience", href: "digital-experience" },
    ],
    company: [
      { label: "Home", href: "/" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
    social: [
      { title: "LinkedIn", href: "https://www.linkedin.com/company/adroitconsulting" },
      { title: "X / Twitter", href: "https://twitter.com/adroitconsult" },
    ],
  },
  contactEmail: "contact@adroit.io",
};

export default NAV;
