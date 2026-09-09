"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * AdminShell — navy sidebar + content column for the /admin operate surface.
 * kara tokens (design-tokens-course-catalog-admin.css §3): navy sidebar,
 * red active-nav rule, dense tables. Non-admins never reach this shell — the
 * layout guard 404s before rendering (US-016).
 *
 * v5 (t_888621eb): nav regrouped by admin job per the Admin Experience
 * Redesign — ACCESS (Overview/People/Courses) · CONTENT (Catalog) · SYSTEM
 * (Analytics/Audit/Offers). The Access Matrix page is killed (ADR-222); its
 * job is absorbed into People + Access·Courses sharing the AccessGrid.
 *
 * v6 (t_71a0d478, ADR-230/233): mobile responsive. The fixed w-60 sidebar is
 * untenable at phone widths, so below md it collapses to an off-canvas
 * hamburger drawer over a navy scrim (`drawerOpen` client state); at md+ it is
 * the same static 240px sidebar. Drawer auto-closes on route change (via
 * usePathname) and on Escape; aria-expanded/controls/aria-hidden stay in sync.
 * Reduced-motion is respected by the global prefers-reduced-motion reset —
 * visibility drives the closed state so the drawer still collapses cleanly.
 *
 * v7 (t_6bfc64a0): focus-on-open. When the drawer opens on a <md viewport,
 * focus moves to the first nav link so forward-Tab from an open drawer walks
 * the drawer's nav links instead of page content behind the scrim.
 */
type NavSection = { section?: string; href: string; label: string; exact?: boolean };

const NAV: NavSection[] = [
  { section: "Access", href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "People" },
  { href: "/admin/access/courses", label: "Courses" },
  { section: "Content", href: "/admin/courses", label: "Catalog" },
  { section: "System", href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/offers", label: "Offers · Coupons" },
];

const MD_BREAKPOINT = 768;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= MD_BREAKPOINT : false,
  );
  const drawerRef = useRef<HTMLElement | null>(null);
  const isActive = (href: string, exact: boolean | undefined) =>
    exact ? pathname === href : pathname.startsWith(href);

  // Auto-close the drawer on route change — never leave it open over the
  // freshly navigated page (ADR-230 a11y + navigation integrity). Adjusting
  // state during render (React's recommended "adjust state when props change"
  // pattern) beats a setState-in-effect, which the hooks lint forbids.
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setDrawerOpen(false);
  }

  // Re-evaluate the desktop breakpoint on resize so the drawer can collapse
  // back off-canvas if the window narrows while it is open (ADR-230).
  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= MD_BREAKPOINT);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Escape closes the drawer and returns focus to the hamburger.
  useEffect(() => {
    if (drawerOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setDrawerOpen(false);
          document.getElementById("admin-nav-toggle")?.focus();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [drawerOpen]);

  // Focus-on-open (t_6bfc64a0, lara A11y follow-up): when the off-canvas
  // drawer is opened on a <md viewport, move focus to the first nav link so a
  // keyboard user's forward Tab advances THROUGH the drawer's nav links
  // instead of landing on page content behind the scrim. The nav links are
  // always mounted (only visibility toggles), so a synchronous focus right
  // after commit is safe — no mount delay. Guarded on !isDesktop so the
  // static desktop sidebar (drawerOpen stays false there anyway) and any
  // resize-to-desktop case never yank focus.
  useEffect(() => {
    if (drawerOpen && !isDesktop) {
      drawerRef.current?.querySelector<HTMLElement>("nav a")?.focus();
    }
  }, [drawerOpen, isDesktop]);

  const close = () => setDrawerOpen(false);
  const open = isDesktop || drawerOpen;

  return (
    <div className="min-h-screen flex w-full">
      {/* Mobile scrim backdrop — md:hidden, shown only while the drawer is
          open on a <md viewport (translucent tap-away to close). */}
      {drawerOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-[var(--admin-scrim)] backdrop-blur-sm"
          style={{ backgroundColor: "var(--admin-scrim)" }}
          aria-hidden
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={close}
        />
      )}

      <aside
        id="admin-drawer"
        ref={drawerRef}
        aria-hidden={!open}
        aria-label="Admin navigation"
        className={`admin-drawer fixed inset-y-0 left-0 z-50 w-[var(--admin-drawer-w)] max-w-[var(--admin-drawer-max-w)] transition-transform duration-[var(--admin-drawer-dur)] ease-[var(--admin-drawer-ease)] ${
          open ? "translate-x-0 visible" : "-translate-x-full invisible"
        } md:static md:z-auto md:w-[var(--admin-sidebar-w)] md:translate-x-0 md:visible flex flex-col text-white`}
        style={{ backgroundColor: "var(--admin-sidebar-bg)" }}
      >
        <div className="px-5 h-[var(--admin-topbar-h)] flex items-center border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2 no-underline">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-red)]" />
            <span className="font-extrabold tracking-tight text-[15px]">
              Adroit Admin
            </span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1" aria-label="Admin">
          {NAV.map((item, i) => (
            <div key={item.href}>
              {item.section && i > 0 && (
                <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-white/30 px-3 pt-3.5 pb-1.5">
                  {item.section}
                </div>
              )}
              <Link
                href={item.href}
                aria-current={isActive(item.href, item.exact) ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 text-[13.5px] font-medium no-underline transition-colors ${
                  isActive(item.href, item.exact)
                    ? "bg-white/10 text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
                onClick={close}
                style={
                  isActive(item.href, item.exact)
                    ? { boxShadow: "inset 3px 0 0 var(--color-red)" }
                    : undefined
                }
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[12.5px] font-semibold no-underline text-white/75 hover:text-white transition-colors"
          >
            <span aria-hidden className="text-white/50">
              &larr;
            </span>
            Back to site
          </Link>
          <div className="font-mono text-[11px] text-white/50">/admin</div>
        </div>
      </aside>

      <div className="w-full min-w-0 flex flex-col">
        <div
          className="h-[var(--admin-topbar-h)] flex items-center gap-3 px-4 sm:px-6 border-b bg-[var(--color-off-white)] dark:bg-[var(--surface-page)]"
          style={{ borderBottom: "1px solid var(--admin-table-border)" }}
        >
          {/* Mobile hamburger — md:hidden; desktop nav lives in the static aside */}
          <button
            id="admin-nav-toggle"
            type="button"
            className="md:hidden inline-flex h-[44px] min-w-[44px] items-center justify-center rounded-lg border bg-[var(--color-off-white)] dark:bg-[var(--surface-page)]"
            style={{ borderColor: "var(--admin-table-border)" }}
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[19px] w-[19px]"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              aria-hidden
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-table-head)] truncate">
            Course Catalog &amp; Access Control
          </span>
        </div>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}