import Link from "next/link";
import { type ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "outline";

const base =
  "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  // Carmine band CTA — reads on the always-dark hero/CTA band in both themes.
  primary:
    "bg-[var(--accent-band)] text-[var(--accent-band-on)] hover:bg-[var(--accent-band-hover)] focus-visible:outline-[var(--accent-band)] px-6 py-3 text-base",
  secondary:
    "bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] hover:bg-[var(--surface-inverse-hover)] focus-visible:outline-[var(--surface-inverse)] px-6 py-3 text-base",
  outline:
    "border-2 border-[var(--ink-band)] text-[var(--ink-band)] hover:bg-[var(--ink-band)]/10 focus-visible:outline-[var(--ink-band)] px-6 py-3 text-base",
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
