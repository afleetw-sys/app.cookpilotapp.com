/** Optional fields sent with `parseRecipeFromURL` when the client has richer text than OG. */

export type ClientRecipeExtraction = {
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  transcript?: string | null;
  imageURL?: string | null;
};
