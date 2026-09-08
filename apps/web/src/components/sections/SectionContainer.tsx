import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  bg?: "white" | "gray" | "navy" | "charcoal";
  id?: string;
};

const bgClasses = {
  white: "bg-white text-charcoal",
  gray: "bg-gray-100 text-charcoal",
  navy: "bg-navy text-white",
  charcoal: "bg-charcoal text-white",
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
