"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  grantAnalyticsConsent,
  revokeAnalyticsConsent,
} from "@/components/analytics/GoogleAnalytics";

const STORAGE_KEY = "adroit_cookie_consent";

type ConsentValue = "granted" | "denied";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ConsentValue | null;
    if (stored === "granted") {
      grantAnalyticsConsent();
    } else if (stored === "denied") {
      revokeAnalyticsConsent();
    } else {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "granted");
    grantAnalyticsConsent();
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "denied");
    revokeAnalyticsConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white px-6 py-4 shadow-lg sm:flex sm:items-center sm:justify-between sm:gap-6"
    >
      <p className="text-sm text-slate">
        We use cookies to understand site usage and improve your experience.
        See our{" "}
        <Link href="/privacy" className="font-medium text-navy underline">
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <button
          onClick={decline}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
        >
          Decline
        </button>
        <button
          onClick={accept}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-dark"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
