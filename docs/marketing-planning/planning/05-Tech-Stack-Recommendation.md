# Tech Stack Recommendation

---

## Platform Comparison

| Criteria | React (Next.js) | WordPress | Salesforce Experience Cloud |
|----------|-----------------|-----------|----------------------------|
| **Enterprise brand experience** | Excellent — fully custom UI/UX | Good — theme-dependent | Good to Excellent — template or custom LWC |
| **Performance control** | Excellent — SSR, SSG, edge caching | Moderate to Good — plugin/host dependent | Moderate — platform-managed |
| **Content editing ease (non-technical)** | Moderate — headless CMS recommended | Excellent — native WYSIWYG editor | Good — for Salesforce-fluent teams |
| **Speed to launch** | Moderate — custom build required | Fast — extensive theme/plugin ecosystem | Moderate — configuration + customization |
| **Security & governance** | Excellent — with proper DevOps pipeline | Moderate — plugin surface area risk | Excellent — Salesforce security model |
| **Salesforce CRM integration** | Good — API-based integration | Good — plugin or API | Native / Excellent — zero-gap |
| **Total design flexibility** | Excellent — no platform constraints | Moderate — theme/plugin boundaries | Moderate to Good — LWC extends reach |
| **Licensing / platform cost** | Infrastructure + development cost | Lower platform cost, variable plugin cost | Higher — Experience Cloud license required |
| **SEO capability** | Excellent — full SSR/SSG control | Excellent — mature plugin ecosystem (Yoast, etc.) | Moderate — less mature SEO tooling |
| **Extensibility (portals, auth)** | Good — custom development required | Moderate — plugin-dependent | Excellent — native portal/community features |
| **Best fit** | Differentiated, high-performance digital platform | Marketing-managed content sites | Salesforce-centered enterprise ecosystems |

---

## Recommendation Summary

| Priority | Recommended Stack |
|----------|-------------------|
| **Premium flexibility & performance** | React (Next.js) with structured headless CMS |
| **Marketing-managed speed** | WordPress with enterprise hosting and strict plugin governance |
| **Salesforce-centric operating model** | Experience Cloud — especially when CRM-native workflows and role-based experiences are strategic priorities |

---

## Deep Evaluation: Salesforce Experience Cloud as a Public-Facing Website Platform

### How Salesforce Can Host and Run a Public Site

Salesforce Experience Cloud (formerly Community Cloud) supports publishing branded, publicly accessible web pages using Salesforce-hosted infrastructure:

- **Custom domain mapping:** A public URL (e.g., `www.adroitconsulting.com`) is mapped to the Experience Cloud site via DNS CNAME.
- **Public access:** Pages can be configured for unauthenticated (guest) users, making them fully public. No Salesforce login is required for visitors.
- **Content management:** The Experience Builder provides drag-and-drop page construction using standard and custom Lightning Web Components (LWC).
- **Native data capture:** Form submissions route directly into Salesforce objects (Leads, Cases, custom objects), triggering Flows, assignment rules, and campaign attribution with zero integration middleware.
- **Theming:** The platform supports branded themes including custom CSS, fonts, and responsive layouts — though with less granular control than a fully custom React build.

### Why Choose Salesforce for This Site

- **Native CRM alignment:** Lead capture, segmentation, routing, lifecycle tracking, and campaign attribution are first-class platform capabilities — no integration layer required.
- **Enterprise governance:** Data residency, access controls, field-level security, and audit trails are built into the platform for organizations that require compliance-grade operations.
- **Portal expansion path:** If Adroit plans to offer authenticated client portals, partner hubs, or self-service areas within 12–18 months, Experience Cloud avoids a future re-platform.
- **Single platform operations:** For teams already operating in Salesforce daily, consolidating the public site reduces toolchain complexity.

### Trade-offs and Constraints

- **Licensing cost:** Experience Cloud requires additional Salesforce licensing (per-member or login-based for authenticated users; page-view-based for public sites). This can significantly exceed WordPress or React hosting costs.
- **Creative freedom:** Front-end customization is possible via LWC but requires Salesforce-specific development skills. Achieving the same level of visual polish as a custom React build demands more effort and budget.
- **Content authoring:** The Experience Builder is functional but less intuitive than WordPress's editor for teams without Salesforce admin experience. Non-technical content updates have a steeper learning curve.
- **SEO maturity:** Salesforce's SEO tooling is less mature than WordPress (Yoast, RankMath) or a custom Next.js setup with full SSR/SSG control. Meta tag management, structured data, and sitemap generation require more manual configuration.
- **Performance:** Page load performance is managed by Salesforce's CDN infrastructure. You have less control over caching strategies, asset optimization, and server-side rendering compared to a Next.js deployment on Vercel or similar edge platforms.

### Decision Framework

#### Choose Experience Cloud when:
- Salesforce is the organization's system of engagement and CRM integration depth is a critical requirement.
- Authenticated portal expansion (client portal, partner hub, knowledge base) is expected within 12–18 months.
- Governance, access control, and data residency requirements outweigh the need for maximal front-end flexibility.
- The team already has Salesforce development and administration capability in-house.

#### Choose React (Next.js) when:
- Brand differentiation, performance, and custom UX are the top priorities.
- Complete architectural control and future composability (headless CMS, API-first) are important.
- The team values framework-agnostic skills and long-term portability.
- SEO and content marketing performance are primary growth channels.

#### Choose WordPress when:
- Internal marketing teams need fast, independent content publishing with minimal technical overhead.
- Budget and speed-to-market are the primary constraints.
- The site is primarily informational/content-driven with standard interactive requirements.
- The organization does not need deep CRM-native integration beyond form submission.

---

## Suggested Stack for Adroit Consulting

### Primary Recommendation

**React (Next.js)** for the premium front-end experience, paired with **Salesforce CRM integration** for lead capture and data workflows.

- **Rationale:** Maximizes brand differentiation and performance. Positions Adroit as a technically sophisticated firm. Salesforce integration is handled via API (Web-to-Lead or REST), keeping the CRM benefits without the Experience Cloud licensing overhead.
- **Hosting:** Vercel, Netlify, or AWS (with CDN/edge caching).
- **CMS layer (optional):** Contentful, Sanity, or Strapi for structured content authoring if non-technical editing is required.

### Alternative: Salesforce-Led Route

**Experience Cloud** is the right choice if Adroit plans to evolve the website into authenticated client or partner experiences within 12–18 months, or if consolidating onto a single Salesforce platform is a strategic priority.

- **Rationale:** Eliminates integration complexity for CRM-connected experiences. Best path if portal/community features are on the near-term roadmap.
- **Trade-off:** Accept higher licensing cost and moderate design flexibility constraints in exchange for platform unification and native data workflows.
