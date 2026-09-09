/**
 * /blog listing — server component (B-08 ride-along).
 *
 * Reads `searchParams` server-side and threads them into the
 * <BlogListingClient> island as a plain prop. Because the island no longer
 * calls `useSearchParams()` itself, it renders fully on the server — the first
 * page of post cards (hero + featured + 8 cards) is present in the initial
 * HTML (fixes LCP / INP / CWV, Brainiac #3 + #9) instead of bailing out to
 * client-side rendering behind a Suspense "Loading posts…" fallback.
 *
 * Reading `searchParams` is a request-time API, so this route is dynamically
 * rendered (server-rendered per request) rather than statically prerendered.
 * Content is nonetheless in the initial HTML for every request, which is what
 * the CWV goal requires. The 48 KB `posts.ts` dataset is resolved server-side
 * only and passed in as a serialized RSC prop — it no longer rides in the
 * client JS bundle.
 */
import { posts } from "@/data/posts";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BlogListingClient from "@/components/BlogListing/BlogListingClient";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BlogListing({ searchParams }: Props) {
  const sp = await searchParams;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        <BlogListingClient posts={posts} searchParams={sp} />
      </main>

      <Footer />
    </div>
  );
}
