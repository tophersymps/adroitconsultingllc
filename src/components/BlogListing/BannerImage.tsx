import Image from "next/image";

interface BannerImageProps {
  post: {
    bannerImage?: string;
    category: string;
    categoryColor: string;
    title: string;
  };
  /** Container classes — the image fills this box absolutely. */
  className?: string;
  /** Show the category letter watermark when falling back to gradient. */
  watermark?: boolean;
}

const gradientMap: Record<string, string> = {
  sf: "from-sky via-sky to-blue-600",
  react: "from-emerald via-emerald to-green-600",
  ai: "from-amber via-amber to-yellow-600",
  mkt: "from-pink via-pink to-rose-600",
  ux: "from-violet via-violet to-purple-600",
  pm: "from-teal via-teal to-cyan-600",
};

/**
 * Post banner: renders the real bannerImage when present (object-cover,
 * absolute fill), otherwise falls back to the category gradient with a
 * subtle radial glow + category letter watermark — same look as today.
 */
export default function BannerImage({
  post,
  className = "",
  watermark = true,
}: BannerImageProps) {
  const grad = gradientMap[post.categoryColor] || gradientMap.sf;

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${grad} ${className}`}
    >
      {post.bannerImage ? (
        <Image
          src={post.bannerImage}
          alt={`Banner image for ${post.title}`}
          fill
          sizes="(max-width: 768px) 100vw, 560px"
          className="object-cover"
          priority={false}
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 40%, rgba(200,16,46,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(14,165,233,0.1) 0%, transparent 50%)",
            }}
          />
          {watermark && (
            <span className="absolute inset-0 flex items-center justify-center text-white/15 text-6xl md:text-7xl font-extrabold select-none">
              {post.category === "AI & Consulting" ? "AI" : "AC"}
            </span>
          )}
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/15" />
    </div>
  );
}
