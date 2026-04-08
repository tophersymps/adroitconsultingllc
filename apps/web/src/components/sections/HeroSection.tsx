import Button from "@/components/ui/Button";
import HeroBackground from "@/components/effects/HeroBackground";

type HeroProps = {
  title: string;
  subtitle: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  compact?: boolean;
  particles?: boolean;
};

export default function HeroSection({
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  compact = false,
  particles = false,
}: HeroProps) {
  return (
    <section
      className={`relative overflow-hidden bg-charcoal ${
        compact ? "py-20 lg:py-28" : "py-28 lg:py-40"
      }`}
    >
      <HeroBackground particles={particles} />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-gray-300 sm:text-xl">
            {subtitle}
          </p>
          {(primaryCta || secondaryCta) && (
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              {primaryCta && (
                <Button variant="primary" href={primaryCta.href}>
                  {primaryCta.label}
                </Button>
              )}
              {secondaryCta && (
                <Button variant="outline" href={secondaryCta.href}>
                  {secondaryCta.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
