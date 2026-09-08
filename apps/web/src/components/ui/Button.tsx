import Link from "next/link";
import { type ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "outline";

const base =
  "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary:
    "bg-carmine text-white hover:bg-carmine-dark focus-visible:outline-carmine px-6 py-3 text-base",
  secondary:
    "bg-navy text-white hover:bg-navy-dark focus-visible:outline-navy px-6 py-3 text-base",
  outline:
    "border-2 border-white text-white hover:bg-white/10 focus-visible:outline-white px-6 py-3 text-base",
};

type ButtonProps = {
  variant?: Variant;
  href?: string;
  className?: string;
} & (
  | ComponentPropsWithoutRef<"a">
  | ComponentPropsWithoutRef<"button">
);

export default function Button({
  variant = "primary",
  href,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} {...(props as ComponentPropsWithoutRef<"a">)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ComponentPropsWithoutRef<"button">)}>
      {children}
    </button>
  );
}
