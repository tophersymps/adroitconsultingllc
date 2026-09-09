import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { type ReactNode } from "react";

/**
 * Marketing page chrome wrapper (merger B2). Matches the host's per-page
 * Header + main + Footer pattern (ADR-003) so the ported marketing pages get
 * the unified nav + footer without duplicating the chrome in every page.
 */
export default function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-page)]">
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
