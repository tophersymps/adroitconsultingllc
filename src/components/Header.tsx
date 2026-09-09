"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, notifyAuthChanged } from "@/lib/hooks/useAuth";
import AvatarMenu from "@/components/AvatarMenu";
import ThemeToggle from "@/components/Theme/ThemeToggle";
import SearchOverlay from "@/components/SearchOverlay";
import { avatarHueClass, initialsFromEmail } from "@/lib/avatar";
import { NAV } from "@/lib/nav";
import type { SiteRoute } from "@/shared/contracts";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesBtnRef = useRef<HTMLButtonElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isLearnActive = pathname === "/atlas" || pathname.startsWith("/atlas/");
  const isHome = pathname === "/";
  const { user, isLoading } = useAuth();
  const [isSigningOut, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // best-effort — the session may already be gone
      }
      notifyAuthChanged();
      router.refresh();
    });
  }

  const serviceActive = (href: string) =>
    pathname === href || (pathname === "/platform-strategy" && href === "/platform-strategy");

  const isActive = (href: SiteRoute) =>
    href === "/" ? isHome : href === "/atlas" ? isLearnActive : pathname === href;

  const authControl = isLoading ? null : user ? (
    <AvatarMenu user={user} onSignOut={handleSignOut} isSigningOut={isSigningOut} />
  ) : (
    <Link
      href={`/login${pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : ""}`}
      className="text-[var(--ink-muted)] text-sm font-medium hover:text-[var(--ink-primary)] transition-colors duration-150 no-underline"
    >
      Sign in
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 bg-[var(--surface-card)]/95 backdrop-blur border-b border-[var(--border-default)] shadow-[0_1px_0_rgba(11,29,58,0.03)]">
      <div className="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href={NAV.brand.homeHref} className="flex items-center no-underline group" aria-label="Adroit Consulting">
          {/* Light mode: full-color company logo on the light header surface. */}
          <Image
            src="/adroit-logo-fullcolor-lightbg.svg"
            alt="Adroit Consulting"
            width={160}
            height={40}
            priority
            className="h-10 w-auto dark:hidden"
          />
          {/* Dark mode: white monochrome logo on the dark header surface (#121a2e). */}
          <Image
            src="/adroit-logo-monochrome-white.svg"
            alt="Adroit Consulting"
            width={160}
            height={40}
            priority
            className="hidden h-10 w-auto dark:block"
          />
        </Link>

        {/* Desktop Nav */}
        <nav aria-label="Main" className="hidden md:flex items-center gap-7">
          {NAV.primary.map((link) =>
            link.label === "Services" ? (
              <div
                key={link.href}
                className="relative"
                onMouseLeave={() => setServicesOpen(false)}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Escape" && servicesOpen) {
                    e.preventDefault();
                    setServicesOpen(false);
                    servicesBtnRef.current?.focus();
                  }
                }}
              >
                <button
                  ref={servicesBtnRef}
                  type="button"
                  onClick={() => setServicesOpen((o) => !o)}
                  onMouseEnter={() => setServicesOpen(true)}
                  aria-expanded={servicesOpen}
                  aria-haspopup="true"
                  className="relative text-[var(--ink-muted)] text-sm font-medium hover:text-[var(--ink-primary)] transition-colors duration-150 no-underline inline-flex items-center gap-1 cursor-pointer bg-none border-none"
                >
                  Services
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {servicesOpen && (
                  <div className="absolute left-0 top-full pt-2">
                    <div className="w-64 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)] shadow-[var(--shadow-menu)] p-2 flex flex-col">
                      {NAV.services.links.map((s) => (
                        <Link
                          key={s.href}
                          href={`/${s.href}` as SiteRoute}
                          aria-current={serviceActive(`/${s.href}`) ? "page" : undefined}
                          onClick={() => setServicesOpen(false)}
                          className="rounded-md px-3 py-2 text-sm font-medium text-[var(--ink-body)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-primary)] no-underline aria-[current=page]:text-[var(--ink-primary)] aria-[current=page]:font-semibold"
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href as SiteRoute) ? "page" : undefined}
                className="relative text-[var(--ink-muted)] text-sm font-medium hover:text-[var(--ink-primary)] transition-colors duration-150 no-underline aria-[current=page]:text-[var(--ink-primary)] aria-[current=page]:font-semibold"
              >
                {link.label}
                <span
                  aria-hidden
                  className={`absolute -bottom-[18px] left-0 right-0 h-[2px] rounded-full bg-[var(--accent)] transition-opacity duration-150 ${
                    isActive(link.href as SiteRoute) ? "opacity-100" : "opacity-0"
                  }`}
                />
              </Link>
            ),
          )}
          <div className="flex items-center gap-4 pl-2 border-l border-[var(--border-subtle)]">
            <SearchOverlay />
            <ThemeToggle authed={!!user} iconOnly />
            <Link
              href="/contact"
              className="inline-flex items-center bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] px-[18px] h-9 rounded-sm text-[0.8rem] font-semibold hover:bg-[var(--surface-inverse-hover)] hover:-translate-y-px active:scale-[0.98] transition-all duration-150 no-underline"
            >
              Contact Us
            </Link>
            {authControl}
          </div>
        </nav>

        {/* Mobile Hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            ref={mobileToggleRef}
            className="bg-none border-none cursor-pointer inline-flex items-center justify-center min-w-[44px] h-11"
            onClick={() => setMobileOpen(!mobileOpen)}
            onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
              if (e.key === "Escape" && mobileOpen) {
                e.preventDefault();
                setMobileOpen(false);
                mobileToggleRef.current?.focus();
              }
            }}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            <span className="block w-5 h-[2px] bg-[var(--ink-primary)] my-[3px] rounded-[1px] transition-all duration-150" />
            <span className="block w-5 h-[2px] bg-[var(--ink-primary)] my-[3px] rounded-[1px] transition-all duration-150" />
            <span className="block w-5 h-[2px] bg-[var(--ink-primary)] my-[3px] rounded-[1px] transition-all duration-150" />
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="md:hidden flex flex-col px-5 py-4 gap-4 border-t border-[var(--border-default)] bg-[var(--surface-card)]"
          onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setMobileOpen(false);
              mobileToggleRef.current?.focus();
            }
          }}
        >
          {NAV.primary.map((link) =>
            link.label === "Services" ? (
              <div key={link.href} className="flex flex-col gap-2 py-1 border-b border-[var(--border-subtle)]">
                <span className="text-[var(--ink-body)] text-sm font-medium">
                  Services
                </span>
                {NAV.services.links.map((s) => (
                  <Link
                    key={s.href}
                    href={`/${s.href}` as SiteRoute}
                    aria-current={serviceActive(`/${s.href}`) ? "page" : undefined}
                    className="pl-3 text-[var(--ink-muted)] text-sm font-medium py-1 no-underline aria-[current=page]:text-[var(--ink-primary)] aria-[current=page]:font-semibold"
                    onClick={() => setMobileOpen(false)}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href as SiteRoute) ? "page" : undefined}
                className="text-[var(--ink-body)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline aria-[current=page]:text-[var(--ink-primary)] aria-[current=page]:font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ),
          )}
          <div className="py-2 border-b border-[var(--border-subtle)] flex items-center gap-3">
            <SearchOverlay />
            <ThemeToggle authed={!!user} compact />
          </div>
          {!isLoading && !user && (
            <Link
              href={`/login${pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : ""}`}
              className="text-[var(--ink-body)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
          )}
          {!isLoading && user && (
            <>
              <div className="flex items-center gap-3 py-3 border-b border-[var(--border-subtle)]">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-[10px] text-[15px] font-bold text-white ${avatarHueClass(user.email)}`}
                >
                  {initialsFromEmail(user.email)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--ink-primary)]">{user.email}</div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                    Signed in as
                  </div>
                </div>
              </div>
              <Link
                href="/profile"
                className="text-[var(--ink-body)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Profile
              </Link>
              <Link
                href="/settings"
                className="text-[var(--ink-body)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline"
                onClick={() => setMobileOpen(false)}
              >
                Settings
              </Link>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="text-[var(--ink-body)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline font-semibold"
                  onClick={() => setMobileOpen(false)}
                >
                  Admin console
                </Link>
              )}
              <button
                onClick={() => {
                  handleSignOut();
                  setMobileOpen(false);
                }}
                className="text-left text-[var(--accent)] text-sm font-medium py-2 border-b border-[var(--border-subtle)] no-underline cursor-pointer bg-none border-none"
              >
                Sign out
              </button>
            </>
          )}
          <Link
            href="/contact"
            className="bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] text-center px-[18px] py-2 rounded-sm text-sm font-semibold hover:bg-[var(--surface-inverse-hover)] no-underline"
            onClick={() => setMobileOpen(false)}
          >
            Contact Us
          </Link>
        </nav>
      )}
    </header>
  );
}
