"use client";

import { useEffect, useState } from "react";

const shareButtons = [
  {
    label: "Twitter/X",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    url: (text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
  {
    label: "LinkedIn",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452z" />
      </svg>
    ),
    url: (text: string) =>
      `https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(text)}`,
  },
  {
    label: "Facebook",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    url: (text: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(text)}`,
  },
];

export default function ShareBar() {
  const [copied, setCopied] = useState(false);
  // Hydration-safe share URL (QA H-1): window.location is read only after
  // mount so the server HTML and the client's first paint both render the
  // empty payload. Once mounted, the real URL populates every share link —
  // no more empty ?text=/?url=/?u= persisting in the DOM.
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    // Mount-gate external-store read (same pattern as useQuizProgress QA F-1):
    // the one-time setState here is intentional — window.location must only be
    // read after hydration so SSR and first paint both render the empty URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentUrl(window.location.href);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="flex items-center gap-2 py-4 border-t border-b border-gray-200 dark:border-[var(--border-default)] my-6">
      <span className="text-xs text-gray-500 dark:text-[var(--ink-muted)] font-medium mr-1 uppercase tracking-wider font-mono">
        Share
      </span>
      {shareButtons.map((btn) => (
        <a
          key={btn.label}
          href={btn.url(currentUrl)}
          target="_blank"
          rel="noopener noreferrer"
          title={btn.label}
          className="min-w-[44px] min-h-[44px] rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)] cursor-pointer hover:bg-navy hover:text-white hover:border-navy hover:-translate-y-0.5 transition-all duration-150 no-underline"
        >
          {btn.icon}
        </a>
      ))}
      <button
        onClick={copyLink}
        title="Copy link"
        aria-label="Copy link to clipboard"
        className={`min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center cursor-pointer transition-all duration-150 ${
          copied
            ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
            : "border-gray-200 bg-white text-gray-500 dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)] hover:bg-navy hover:text-white hover:border-navy hover:-translate-y-0.5"
        }`}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
    </div>
  );
}
