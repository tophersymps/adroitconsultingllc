import Link from "next/link";
import Image from "next/image";
import { NAV } from "@/lib/nav";
import type { SiteRoute } from "@/shared/contracts";

/**
 * Unified site footer (merger B1). Repoints the stale external adroit.io
 * /about /services /careers links to real local destinations (/ , the three
 * service pages, /contact, /privacy). Reads groupings from the shared NAV
 * model so it never drifts from the Header.
 *
 * The always-dark --surface-band background + band inks keep the footer
 * readable in BOTH light and dark mode (kara design t_f9f4d486). The white
 * monochrome company logo is used on this dark band (matching live prod
 * footer which pairs the brand with the Adroit mark).
 */
export default function Footer() {
  return (
    <footer className="bg-[var(--surface-band)] text-[var(--ink-band-muted)]">
      <div className="max-w-[1120px] mx-auto px-6 pt-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href={NAV.brand.homeHref} className="inline-flex items-center gap-3 mb-3 no-underline group">
              <Image
                src="/adroit-logo-monochrome-white.svg"
                alt="Adroit Consulting"
                width={44}
                height={44}
                className="h-11 w-11 transition-opacity duration-150 group-hover:opacity-90"
              />
              <span className="font-bold text-lg tracking-tight text-[var(--ink-band)]">
                {NAV.brand.name}
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-[280px] text-[var(--ink-band-muted)]">
              Salesforce platform strategy, operational intelligence, and
              AI-enhanced digital experiences. We help growing businesses
              modernize and scale.
            </p>
          </div>

          {/* Blog Links */}
          <div>
            <h4 className="text-[var(--ink-band)] text-xs font-semibold uppercase tracking-[0.06em] mb-3.5">
              Blog
            </h4>
            <ul className="list-none space-y-2">
              {NAV.footer.blog.map((link) => (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-[var(--ink-band)] text-xs font-semibold uppercase tracking-[0.06em] mb-3.5">
              Services
            </h4>
            <ul className="list-none space-y-2">
              {NAV.footer.services.map((link) => (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </ul>
            <h4 className="text-[var(--ink-band)] text-xs font-semibold uppercase tracking-[0.06em] mb-3.5 mt-6">
              Company
            </h4>
            <ul className="list-none space-y-2">
              {NAV.footer.company.map((link) => (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[var(--border-band)] py-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-[var(--ink-band-muted)]">
          <span>&copy; {new Date().getFullYear()} {NAV.brand.name}. All rights reserved.</span>
          <div className="flex gap-3">
            {NAV.footer.social.map((s) => (
              <a
                key={s.title}
                title={s.title}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.title}
                className="w-7 h-7 rounded-full bg-[var(--surface-band-elev)] flex items-center justify-center text-[var(--ink-band-muted)] text-[0.65rem] select-none hover:bg-[var(--surface-band-elev)] hover:text-[var(--ink-band)] transition-colors duration-150"
              >
                {s.title === "LinkedIn" ? "in" : s.title === "X / Twitter" ? "𝕏" : s.title}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: SiteRoute; children: React.ReactNode }) {
  // Service slugs are stored bare in the contract (ServiceSlug); normalize to
  // an absolute path for Next Link.
  const resolved = href.startsWith("/") ? href : `/${href}`;
  return (
    <li>
      <Link
        href={resolved}
        className="text-[var(--ink-band-muted)] text-xs no-underline hover:text-[var(--ink-band)] transition-colors duration-150"
      >
        {children}
      </Link>
    </li>
  );
}
