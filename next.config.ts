import type { NextConfig } from "next";

/**
 * Origins the BROWSER itself must be allowed to reach (CSP connect-src).
 *
 * The Neon Data API is fetched directly from the browser by
 * src/lib/db/client.ts — signed-in reads of read_progress / lesson_completion
 * go straight there, not through a same-origin route. If the origin is missing
 * from connect-src the CSP blocks those reads, the client swallows the error
 * and a signed-in user on a new device always sees "unread / incomplete"
 * while writes (which use /api/progress/*) still work — a silent regression
 * (QA F1 on PR #361, t_51f9ebfb).
 *
 * Source of truth is NEXT_PUBLIC_NEON_DATA_API_URL, the same value the browser
 * client reads. The literal is the production project endpoint and stays in the
 * list unconditionally: the env var is present on the normal build path, but a
 * build/start that loses it must not silently emit a CSP that blocks reads
 * again.
 */
export const NEON_DATA_API_ORIGIN_FALLBACK =
  "https://ep-noisy-glade-b7jpeudp.apirest.c-13.us-east-1.aws.neon.tech";

/** Unique origins to allow in connect-src for the Neon Data API. */
function neonDataApiOrigins(): string[] {
  const origins = new Set<string>([NEON_DATA_API_ORIGIN_FALLBACK]);
  const configured = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // Malformed env value — keep the known production origin rather than
      // emitting an unusable CSP token.
    }
  }
  return [...origins];
}

const nextConfig: NextConfig = {

  // The /preview/* routes read content/*.mdx at request time, but Vercel
  // serverless functions only bundle files traced at build time. Without
  // these includes the preview functions deploy but return empty content —
  // the single most likely silent-failure point (draft-state t_e1c8239e).
  outputFileTracingIncludes: {
    "/preview/field-notes/[slug]": ["./content/blog/**/*.mdx"],
    "/preview/atlas/[series]/[slug]": ["./content/learn/**/*.mdx"],
  },

  experimental: {
    // Cap build worker fan-out. Next's default for this knob is
    // `max(1, os.cpus().length - 1)` — 11 on this 12-logical-CPU machine —
    // which spawned 11 concurrent build workers at ~150 MB RSS each on top of
    // two local LLM servers already pinning ~36.9 GB, pushing the kernel into
    // swap during the 2026-09-16 deploy-gate build. 4 caps both worker phases
    // ("Collecting page data using 4 workers", "Generating static pages using
    // 4 workers"), measured worker-only RSS ~1.65 GB -> ~0.95 GB. NB: the
    // single next-build coordinator process (~1.7 GB on a cold build) is NOT
    // governed by this knob and still dominates the peak. Build-time resource
    // cap only — no effect on output or runtime behaviour.
    cpus: 4,
    // NOTE (t_67209e0d, measured 2026-09-16): the coordinator above is NOT
    // governed by this knob and is not reducible by any build-time config found.
    // Cold-build peak tree RSS on this box: 2.88 GB (cpus:4 alone), 3.04 GB with
    // NODE_OPTIONS=--max-old-space-size=1024, 2.89 GB with
    // turbopackMemoryEviction:'full', 2.99 GB with typescript.ignoreBuildErrors,
    // 2.87 GB with turbopackPluginRuntimeStrategy:'workerThreads'. The
    // coordinator's 1.5-1.6 GB RSS is not its JS old space (a 64 MB heap cap
    // still OOMs it at 1.48 GB RSS). Remaining lever is building off-box while
    // the local models are resident — evidence:
    // /Users/kelex/.hermes/kanban/workspaces/t_67209e0d-evidence/
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
              // connect-src must carry the Neon Data API origin: the browser
              // client fetches it directly for signed-in progress reads
              // (src/lib/db/client.ts). See neonDataApiOrigins() above.
              // *.supabase.co is gone — Supabase was removed in R2-2 and no
              // browser code talks to it any more.
              `connect-src 'self' ${neonDataApiOrigins().join(" ")} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://googleads.g.doubleclick.net https://www.google.com https://www.gstatic.com`,
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
