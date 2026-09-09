import type { Metadata } from "next";

/**
 * /lab — internal observatories. Never index.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
