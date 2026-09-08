"use client";

import Script from "next/script";
import { useEffect } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function grantAnalyticsConsent() {
  if (!GA_ID || typeof window === "undefined") return;
  window.gtag("consent", "update", {
    analytics_storage: "granted",
  });
}

export function revokeAnalyticsConsent() {
  if (!GA_ID || typeof window === "undefined") return;
  window.gtag("consent", "update", {
    analytics_storage: "denied",
  });
}

export default function GoogleAnalytics() {
  if (!GA_ID) return null;

  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "default", {
      analytics_storage: "denied",
    });
    window.gtag("config", GA_ID, {
      anonymize_ip: true,
    });
  }, []);

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      strategy="afterInteractive"
    />
  );
}
