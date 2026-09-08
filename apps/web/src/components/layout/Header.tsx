"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_LINKS, CONTACT_HREF } from "@/lib/constants";

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" onClick={() => setMobileOpen(false)}>
          <Image
            src="/adroit-logo-fullcolor-lightbg.svg"
            alt="Adroit Consulting — Home"
            width={160}
            height={44}
            priority
            className="h-10 w-auto"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-navy ${
                pathname === link.href
                  ? "text-navy"
                  : "text-slate"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={CONTACT_HREF}
            className="rounded-lg bg-carmine px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-carmine-dark"
          >
            Contact Us
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-charcoal transition-colors hover:bg-gray-100 lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav className="border-t border-gray-200 bg-white px-6 pb-6 pt-4 lg:hidden">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-base font-medium transition-colors hover:text-navy ${
                  pathname === link.href
                    ? "text-navy"
                    : "text-slate"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={CONTACT_HREF}
              onClick={() => setMobileOpen(false)}
              className="mt-2 rounded-lg bg-carmine px-5 py-3 text-center text-base font-semibold text-white transition-colors hover:bg-carmine-dark"
            >
              Contact Us
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
