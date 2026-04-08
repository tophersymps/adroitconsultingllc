import Link from "next/link";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-navy">
        404
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-charcoal sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-slate">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Let&apos;s get you back on track.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Button href="/">Back to Home</Button>
        <Link
          href="/contact"
          className="text-sm font-semibold text-navy hover:underline"
        >
          Contact Us &rarr;
        </Link>
      </div>
    </section>
  );
}
