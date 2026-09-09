import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  bg?: "white" | "gray" | "navy" | "charcoal";
  id?: string;
};

const bgClasses = {
  white: "bg-[var(--surface-page)] text-[var(--ink-heading)]",
  gray: "bg-[var(--surface-section-alt)] text-[var(--ink-heading)]",
  navy: "bg-[var(--surface-band-deep)] text-[var(--ink-band)]",
  charcoal: "bg-[var(--surface-band)] text-[var(--ink-band)]",
};

export default function SectionContainer({
  children,
  className = "",
  bg = "white",
  id,
}: Props) {
  return (
    <section id={id} className={`py-20 lg:py-28 ${bgClasses[bg]} ${className}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">{children}</div>
    </section>
  );
}
