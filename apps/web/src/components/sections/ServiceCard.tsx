import Link from "next/link";
import { type ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
};

export default function ServiceCard({ title, description, href, icon }: Props) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-navy/30 hover:shadow-lg"
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-navy/10 text-navy">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-charcoal group-hover:text-navy">
        {title}
      </h3>
      <p className="mt-3 flex-1 text-base leading-relaxed text-slate">
        {description}
      </p>
      <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-navy">
        Learn more
        <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </span>
    </Link>
  );
}
