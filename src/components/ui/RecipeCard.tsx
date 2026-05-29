"use client";

import Link from "next/link";
import { Clock, Users } from "@phosphor-icons/react";
import { RecipeCoverImage } from "@/components/ui/RecipeCoverImage";
import { useResolvedRecipeCoverSrc } from "@/lib/cookpilot/useResolvedRecipeCoverSrc";
import type { RecipeSummary } from "@/lib/cookpilot/types";

function hashRecipeSeed(recipe: RecipeSummary): number {
  const seed = `${recipe.id}:${recipe.title ?? ""}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function RecipeCardCover({
  alt,
  imageURL,
  ratioIndex,
  recipeId,
}: {
  alt: string;
  imageURL: string | null | undefined;
  ratioIndex: 0 | 1;
  recipeId: string;
}) {
  const rawUrl = typeof imageURL === "string" ? imageURL.trim() : "";
  const { src, expired, handleImageError } = useResolvedRecipeCoverSrc(rawUrl, recipeId);

  // Always paint a URL when we have one — do not gate on `failed` (retry sets failed
  // during recovery and was hiding every cover). Placeholder only when no imageURL.
  const coverSrc = rawUrl && !expired ? (src ?? rawUrl) : null;

  return (
    <RecipeCoverImage
      alt={alt}
      coverSrc={coverSrc}
      onError={() => void handleImageError()}
      ratioIndex={ratioIndex}
    />
  );
}

export function RecipeCard({
  recipe,
  href,
  isSelected,
  onOpen,
  onSelect,
}: {
  recipe: RecipeSummary;
  href?: string;
  isSelected: boolean;
  onOpen?: () => void;
  onSelect?: () => void;
}) {
  const seed = hashRecipeSeed(recipe);
  const tiltClass = `cp-recipe-card--tilt-${seed % 6}`;
  // Use unsigned right shift (>>>) — `seed` can be > 2^31, and signed >> would produce
  // a negative result, making ratioIndex -1 (h = undefined, wrong CSS class) and
  // tapeClass indices negative (non-existent CSS variants).
  const ratioIndex = ((seed >>> 4) & 1) as 0 | 1;
  const tapeClass = `cp-recipe-card__tape--${(seed >>> 8) % 5}`;
  const className = `cp-recipe-card ${tiltClass} ${isSelected ? "is-selected" : ""}`.trim();

  const body = (
    <>
      <span aria-hidden="true" className={`cp-recipe-card__tape ${tapeClass}`.trim()} />
      <RecipeCardCover
        alt={recipe.title || "Recipe image"}
        imageURL={recipe.imageURL}
        ratioIndex={ratioIndex}
        recipeId={recipe.id}
      />
      <div className="cp-recipe-card__body">
        <h4>{recipe.title || "Untitled Recipe"}</h4>
        <div className="cp-recipe-card__meta">
          {recipe.totalTimeMinutes ? (
            <span>
              <Clock size={14} weight="regular" />
              {recipe.totalTimeMinutes} min
            </span>
          ) : null}
          {recipe.servings ? (
            <span>
              <Users size={14} weight="regular" />
              {recipe.servings}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link className={className} href={href} onClick={onOpen}>
        {body}
      </Link>
    );
  }

  return (
    <button className={className} onClick={onSelect} type="button">
      {body}
    </button>
  );
}
