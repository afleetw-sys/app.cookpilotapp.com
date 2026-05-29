"use client";

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
        className="cp-recipe-card__image"
        decoding="async"
        onError={onError}
        onLoad={onLoad}
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
