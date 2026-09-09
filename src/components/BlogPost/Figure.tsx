import React from "react";

/**
 * Figure — renders inline article images (diagrams, screenshots) with a
 * caption, rounded corners, and lazy loading. MDX markdown images
 * (`![caption](</diagrams/...>)`) map to this component via the `img`
 * override in the MDX renderer; the markdown alt text becomes both the
 * accessible label and the visible caption.
 */
export default function Figure({
  src,
  alt = "",
  title,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const caption = title ?? alt;
  return (
    <figure className="my-8">
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-gray-200 shadow-sm shadow-gray-200/50 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain img needed for MDX-sourced /public assets */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-auto block"
          {...rest}
        />
      </div>
      {caption && (
        <figcaption className="mt-2.5 text-center text-[13px] leading-relaxed text-gray-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
