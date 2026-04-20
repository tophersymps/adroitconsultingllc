import Button from "@/components/ui/Button";

type Props = {
  headline: string;
  body?: string;
  ctaLabel: string;
  ctaHref: string;
};

export default function CTABlock({ headline, body, ctaLabel, ctaHref }: Props) {
  return (
    <section className="bg-navy py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 text-center lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {headline}
        </h2>
        {body && (
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            {body}
          </p>
        )}
        <div className="mt-10">
          <Button variant="primary" href={ctaHref}>
            {ctaLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}
