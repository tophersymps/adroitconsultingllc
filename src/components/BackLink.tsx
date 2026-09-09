import Link from "next/link";

export default function BackLink({ href = "/blog" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-6 hover:text-navy dark:text-[var(--ink-muted)] dark:hover:text-[var(--ink-primary)] transition-colors duration-150"
    >
      ← Back to Blog
    </Link>
  );
}
