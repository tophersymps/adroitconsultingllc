import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Paywall from "@/components/Catalog/Paywall";
import type { PaywallView } from "@/shared/contracts-course-catalog";

/**
 * LockedContentPage — full-page wrapper rendering the Paywall for a locked
 * live course (Header + Footer + Paywall). Shared by the lesson, check, exam,
 * and certificate content surfaces so every paywall branch renders identically.
 * Only used when the access seam returned kind === "paywall".
 */
export function LockedContentPage({
  view,
  seriesSlug,
}: {
  view: PaywallView;
  seriesSlug: string;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        <Paywall view={view} seriesSlug={seriesSlug} />
      </main>
      <Footer />
    </div>
  );
}
