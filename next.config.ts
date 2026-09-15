import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /preview/* routes read content/*.mdx at request time, but Vercel
  // serverless functions only bundle files traced at build time. Without
  // these includes the preview functions deploy but return empty content —
  // the single most likely silent-failure point (draft-state t_e1c8239e).
  outputFileTracingIncludes: {
    "/preview/field-notes/[slug]": ["./content/blog/**/*.mdx"],
    "/preview/atlas/[series]/[slug]": ["./content/learn/**/*.mdx"],
  },

  async redirects() {
    return [
      // /blog → /field-notes and /learn → /atlas (URL migration t_1ab5ef9f).
      // 301 permanent so existing bookmarks/backlinks/crawlers pass equity to
      // the new canonical paths. /blog/categories is covered by the
      // /blog/:path* wildcard; /tags does NOT move and needs no redirect.
      {
        source: "/blog/:path*",
        destination: "/field-notes/:path*",
        permanent: true,
      },
      {
        source: "/blog",
        destination: "/field-notes",
        permanent: true,
      },
      {
        source: "/learn/:path*",
        destination: "/atlas/:path*",
        permanent: true,
      },
      {
        source: "/learn",
        destination: "/atlas",
        permanent: true,
      },
      // kelexconsulting.com → adroit.io (path-preserving 301)
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "kelexconsulting.com",
          },
        ],
        destination: "https://adroit.io/:path*",
        permanent: true,
      },
      // www.kelexconsulting.com → adroit.io
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.kelexconsulting.com",
          },
        ],
        destination: "https://adroit.io/:path*",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          {
            key: "Content-Security-Policy",
            // Conservative, static-content site (SSG — no nonces possible:
            // nonce-based CSP forces dynamic rendering on every page).
            // Next.js injects inline bootstrap scripts on static pages, so
            // 'unsafe-inline' is required for script-src per the Next docs;
            // remote script injection is still blocked. JSON-LD and MDX are
            // rendered from trusted in-repo content.
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob: https://www.google-analytics.com https://www.gstatic.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              // reCAPTCHA v3 (contact form) loads from www.google.com and its
              // runtime assets from www.gstatic.com. Without these hosts the
              // script is CSP-blocked and the anti-bot control either breaks
              // the form (site key set) or is inert (key unset). See
              // src/app/contact/page.tsx:139. (t_fd9f68c2)
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.gstatic.com",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://googleads.g.doubleclick.net https://www.google.com https://www.gstatic.com",
              "frame-src 'self' https://www.google.com",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
