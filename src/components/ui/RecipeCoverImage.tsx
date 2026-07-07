"use client";

import { useState } from "react";

const COVER_SLOT_HEIGHT_PX: Record<0 | 1, number> = { 0: 216, 1: 190 };

export function RecipeCoverImage({
  alt,
  coverSrc,
  onError,
  onLoad,
  ratioIndex,
}: {
  alt: string;
  coverSrc: string | null;
  onError: () => void;
  onLoad?: () => void;
  ratioIndex: 0 | 1;
}) {
  const h = COVER_SLOT_HEIGHT_PX[ratioIndex];
  const wrapClass = `cp-recipe-card__image-wrap cp-recipe-card__image-wrap--ratio-${ratioIndex}`;
  // Fade each cover in as its bytes arrive instead of letting it pop in mid-scroll.
  // Reset synchronously during render (not an Effect) whenever the source changes
  // (e.g. an error-recovery src swap) — see https://react.dev/learn/you-might-not-need-an-effect.
  const [loaded, setLoaded] = useState(false);
  const [loadedForSrc, setLoadedForSrc] = useState(coverSrc);
  if (coverSrc !== loadedForSrc) {
    setLoadedForSrc(coverSrc);
    setLoaded(false);
  }

  if (!coverSrc) {
    return (
      <div className={`${wrapClass} cp-recipe-card__image-wrap--empty`} style={{ height: h }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="cp-recipe-card__placeholder"
          height={58}
          src="/images/cp-logo-lg.png"
          width={58}
        />
      </div>
    );
  }

  return (
    <div className={wrapClass} style={{ height: h, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={`cp-recipe-card__image ${loaded ? "is-loaded" : ""}`.trim()}
        decoding="async"
        loading="lazy"
        onError={onError}
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
        src={coverSrc}
        style={{
          display: "block",
          width: "100%",
          height: h,
          objectFit: "cover",
          objectPosition: "center",
        }}
      />
    </div>
  );
}
