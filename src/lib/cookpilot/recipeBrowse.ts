import type { RecipeSummary } from "@/lib/cookpilot/types";

export type RecipeSortOption = "createdDate" | "lastViewed" | "alphabetical";

export const RECIPE_SORT_OPTIONS: Array<{
  value: RecipeSortOption;
  label: string;
}> = [
  { value: "createdDate", label: "Date added" },
  { value: "lastViewed", label: "Last viewed" },
  { value: "alphabetical", label: "A–Z" },
];

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

export function recipeAllTags(recipe: RecipeSummary) {
  return Array.from(new Set([...recipe.tags, ...recipe.systemTags].filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function knownTagsFromRecipes(recipes: RecipeSummary[]): string[] {
  return Array.from(new Set(recipes.flatMap((recipe) => recipeAllTags(recipe)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function recipeMatchesSearch(recipe: RecipeSummary, searchQuery: string) {
  const tokens = searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const haystack = [
    recipe.title ?? "",
    ...(recipe.ingredientNames ?? []),
    ...recipe.tags,
    ...recipe.systemTags,
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

export function recipeMatchesTags(recipe: RecipeSummary, activeTagFilters: Set<string>) {
  if (activeTagFilters.size === 0) return true;

  const tags = new Set(recipeAllTags(recipe).map(normalizeToken));
  return Array.from(activeTagFilters).every((tag) => tags.has(normalizeToken(tag)));
}

export function sortRecipes(
  recipes: RecipeSummary[],
  sortOption: RecipeSortOption,
  lastViewedTimestamps: Record<string, number>,
) {
  const nextRecipes = [...recipes];

  switch (sortOption) {
    case "alphabetical":
      nextRecipes.sort((left, right) =>
        (left.title ?? "Untitled Recipe").localeCompare(right.title ?? "Untitled Recipe", undefined, {
          sensitivity: "base",
        }),
      );
      return nextRecipes;
    case "lastViewed":
      nextRecipes.sort((left, right) => {
        const leftViewed = lastViewedTimestamps[left.id];
        const rightViewed = lastViewedTimestamps[right.id];
        const leftMs =
          typeof leftViewed === "number" && Number.isFinite(leftViewed)
            ? leftViewed
            : Number.NEGATIVE_INFINITY;
        const rightMs =
          typeof rightViewed === "number" && Number.isFinite(rightViewed)
            ? rightViewed
            : Number.NEGATIVE_INFINITY;

        if (leftMs !== rightMs) {
          return rightMs - leftMs;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      });
      return nextRecipes;
    case "createdDate":
    default:
      nextRecipes.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      return nextRecipes;
  }
}
