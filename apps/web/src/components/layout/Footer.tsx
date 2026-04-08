import Link from "next/link";
import Image from "next/image";
import { NAV_LINKS, CONTACT_HREF, COMPANY } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-charcoal text-gray-300">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-3">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/adroit-logo-fullcolor-darkbg.svg"
                alt="Adroit Consulting"
                width={40}
                height={40}
              />
              <span className="text-lg font-semibold text-white">
                Adroit Consulting
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-gray-400">
              {COMPANY.tagline}
            </p>
          </div>

          {/* Services */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              Services
            </h3>
            <ul className="space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              Get in Touch
            </h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li>
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="transition-colors hover:text-white"
                >
                  {COMPANY.email}
                </a>
              </li>
              <li>
                <Link
                  href={CONTACT_HREF}
                  className="transition-colors hover:text-white"
                >
                  Schedule a Consultation
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-charcoal-light pt-8 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
