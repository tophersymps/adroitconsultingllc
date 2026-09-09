/**
 * src/shared/contracts-merger.ts - cross-sub-task contract types for the Adroit
 * site + blog merger build (arch task t_bf0336b5).
 *
 * Owned by brainiac. Steel sub-task workers (chrome, marketing port, contact,
 * SEO integration) IMPORT from here. This file is type-only and dependency-free
 * by design so every steel worker can import it without pulling app runtime
 * modules. Re-exported from ./contracts.ts so workers share one canonical path.
 *
 * Mirrors: deliverables/system-architecture.html (t_bf0336b5).
 * Seed base: v2 branch of tophersymps/adroitconsultingllc (blog host b8ca4e8).
 */

/* ------------------------------------------------------------------ */
/*  Site model: nav + routes that chrome and ported pages must agree on */
/* ------------------------------------------------------------------ */

/** Marketing service slugs. These are the three top-level service pages. */
export type ServiceSlug =
  | "platform-strategy"
  | "operational-intelligence"
  | "digital-experience";

/** Leaf hrefs that any nav, footer, or CTA may point to. */
export type SiteRoute =
  | "/"
  | ServiceSlug
  | "/contact"
  | "/privacy"
  | "/blog"
  | "/blog/categories"
  | "/tags"
  | "/learn"
  | "/login"
  | "/forgot-password"
  | "/profile"
  | "/settings"
  | "/admin";

/**
 * Single source of truth for the unified site chrome. Header, Footer, and any
 * "Back to home" CTA must read labels + hrefs from a shared NAV model (see
 * src/lib/nav.ts which the chrome sub-task owns) so the marketing pages and the
 * chrome never drift. Services render as a dropdown group over the three
 * ServiceSlug pages.
 */
export interface NavLink {
  label: string;
  href: SiteRoute;
}

export interface ServicesGroup {
  label: string;
  links: { label: string; href: ServiceSlug }[];
}

export interface SiteNavModel {
  brand: { name: string; homeHref: "/" };
  /** Main desktop + mobile top-level items in display order. */
  primary: NavLink[];
  /** Dropdown group label + the three service links. */
  services: ServicesGroup;
  /** Footer groupings; footer should repoint stale external /about /services /careers. */
  footer: {
    blog: NavLink[];
    services: NavLink[];
    company: NavLink[];
    social: { title: string; href: string }[];
  };
  /** External canonical e-mail used by Contact success text and privacy copy. */
  contactEmail: string;
}

/* ------------------------------------------------------------------ */
/*  Design token contract (light + dark).                              */
/* ------------------------------------------------------------------ */

/**
 * Shared brand + surface palette. Blog uses class-based dark mode
 * (`documentElement.classList.add("dark")` via ThemeProvider) and CSS custom
 * properties (`--surface-*`, `--ink-*`, `--accent-*`, `--border-*`) that switch
 * under `.dark`. The marketing port carries the carmine/navy/charcoal/slate
 * brand palette. Contract: marketing pages consume ONLY these CSS variables
 * (no hardcoded light-only hexes) so dark-mode parity holds site-wide.
 */
export interface BrandPalette {
  /** Marketing brand red used for accents. */
  carmine: "#A50044";
  carmineDark: "#8A003A";
  /** Blog + marketing shared navy (surface-inverse / CTA background). */
  navy: "#004D98";
  navyDark: "#003B75";
  navyLight: "#0062C4";
  charcoal: "#1F2937";
  charcoalLight: "#374151";
  slate: "#4B5563";
}

/**
 * CSS custom-property names each surface must define for both `:root` (light)
 * and `.dark`. These names are the contract - a marketing section may reference
 * any token below and it must resolve in both themes.
 */
export type ThemeTokenName =
  | "surface-page"
  | "surface-card"
  | "surface-inverse"
  | "ink-primary"
  | "ink-body"
  | "ink-muted"
  | "ink-faint"
  | "accent"
  | "accent-hover"
  | "border-default"
  | "border-subtle"
  | "border-strong";

/* ------------------------------------------------------------------ */
/*  Contact / Web-to-Lead contract (contact page + /api/contact)       */
/* ------------------------------------------------------------------ */

/**
 * Client -> POST /api/contact payload. Field names match the existing marketing
 * form + Salesforce Web-to-Lead mapping (see apps/web/src/app/api/contact in the
 * grafted origin copy).
 */
export interface ContactLeadPayload {
  fullName: string;
  email: string;
  company: string;
  role?: string;
  service: string;
  timeline?: string;
  message?: string;
  /** Honeypot - must always be empty from a real user. */
  website?: string;
  /** reCAPTCHA v3 token from NEXT_PUBLIC_RECAPTCHA_SITE_KEY. */
  recaptchaToken?: string;
}

export type ContactSubmitResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

/**
 * Env contract for the contact flow. Values must exist on the final Vercel
 * project (blog Supabase keys are the only blog env that also carry over - they
 * are out of scope for the contact contract).
 */
export interface ContactEnv {
  SALESFORCE_OID: string;
  RECAPTCHA_SECRET_KEY: string;
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: string;
  NEXT_PUBLIC_SITE_URL: string;
}

/* ------------------------------------------------------------------ */
/*  Analytics consent contract (CookieConsent + GA4)                   */
/* ------------------------------------------------------------------ */

export type AnalyticsConsent = "granted" | "denied";

/**
 * GA4 consent-mode interface the unified CookieConsent drives. The blog's
 * AnalyticsInit must no longer load gtag.js unconditionally when a consent
 * banner is shown; it should default to "denied" until the user grants, then
 * push gtag consent defaults. Contract key: localStorage "adroit_cookie_consent"
 * = granted | denied (ported from the marketing CookieConsent).
 */
export interface ConsentAnalyticsApi {
  storageKey: "adroit_cookie_consent";
  grant(): void;
  revoke(): void;
}
