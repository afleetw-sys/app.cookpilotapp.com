import type { RecipePageCursor, RecipeSummary, SavedRecipe } from "@/lib/cookpilot/types";
import { getRecentlyViewedTimestamps } from "@/lib/cookpilot/recentlyViewed";

export type RecipesBrowseSessionCache = {
  userId: string;
  recipes: RecipeSummary[];
  nextCursor: RecipePageCursor | null;
  totalRecipeCount: number;
  lastViewedTimestamps: Record<string, number>;
  scrollY: number;
};

let sessionCache: RecipesBrowseSessionCache | null = null;

export function getRecipesBrowseSessionCache(
  userId: string,
): RecipesBrowseSessionCache | null {
  if (sessionCache?.userId !== userId) return null;
  return sessionCache;
}

export function saveRecipesBrowseSessionCache(cache: RecipesBrowseSessionCache) {
  if (sessionCache?.userId !== cache.userId) {
    sessionCache = cache;
    return;
  }

  const cachedById = new Map(sessionCache.recipes.map((recipe) => [recipe.id, recipe]));
  const incomingIds = new Set(cache.recipes.map((recipe) => recipe.id));
  const preservedRecipes = sessionCache.recipes.filter((recipe) => !incomingIds.has(recipe.id));

  sessionCache = {
    ...cache,
    recipes: [
      ...preservedRecipes,
      ...cache.recipes.map((recipe) => ({ ...(cachedById.get(recipe.id) ?? {}), ...recipe })),
    ],
    totalRecipeCount: Math.max(cache.totalRecipeCount, sessionCache.totalRecipeCount),
    lastViewedTimestamps: {
      ...sessionCache.lastViewedTimestamps,
      ...cache.lastViewedTimestamps,
    },
  };
}

export function clearRecipesBrowseSessionCache() {
  sessionCache = null;
}

export function updateRecipeSummaryInBrowseSessionCache(
  userId: string,
  recipeId: string,
  updates: Partial<Pick<RecipeSummary, "imageURL" | "title" | "tags" | "systemTags" | "totalTimeMinutes">>,
) {
  if (sessionCache?.userId !== userId) return;

  sessionCache = {
    ...sessionCache,
    recipes: sessionCache.recipes.map((recipe) =>
      recipe.id === recipeId ? { ...recipe, ...updates } : recipe,
    ),
  };
}

export function removeRecipeFromBrowseSessionCache(userId: string, recipeId: string) {
  if (sessionCache?.userId !== userId) return;

  sessionCache = {
    ...sessionCache,
    recipes: sessionCache.recipes.filter((recipe) => recipe.id !== recipeId),
    totalRecipeCount: Math.max(0, sessionCache.totalRecipeCount - 1),
  };
}

function savedRecipeToSummary(recipe: SavedRecipe): RecipeSummary {
  return {
    id: recipe.id,
    title: recipe.recipe.title ?? null,
    imageURL: recipe.recipe.imageURL ?? null,
    localImagePath: recipe.recipe.localImagePath ?? null,
    sourceURL: recipe.sourceURL ?? null,
    createdAt: recipe.createdAt,
    preferredServings: recipe.preferredServings ?? null,
    servings: recipe.recipe.servings ?? null,
    ingredientNames: recipe.ingredientNames,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    tags: recipe.recipe.tags ?? [],
    systemTags: recipe.recipe.systemTags ?? [],
    themeSeedColors: recipe.themeSeedColors ?? null,
  };
}

export function upsertSavedRecipeInBrowseSessionCache(
  userId: string,
  recipe: SavedRecipe,
  options?: { viewedAt?: number },
) {
  if (sessionCache?.userId !== userId) return;

  const summary = savedRecipeToSummary(recipe);
  const exists = sessionCache.recipes.some((current) => current.id === recipe.id);
  const recipes = exists
    ? sessionCache.recipes.map((current) =>
        current.id === recipe.id ? { ...current, ...summary } : current,
      )
    : [summary, ...sessionCache.recipes];

  sessionCache = {
    ...sessionCache,
    recipes,
    totalRecipeCount: exists ? sessionCache.totalRecipeCount : sessionCache.totalRecipeCount + 1,
    lastViewedTimestamps:
      typeof options?.viewedAt === "number"
        ? { ...sessionCache.lastViewedTimestamps, [recipe.id]: options.viewedAt }
        : sessionCache.lastViewedTimestamps,
  };
}

export function syncSavedRecipeToBrowseSessionCache(userId: string, recipe: SavedRecipe) {
  upsertSavedRecipeInBrowseSessionCache(userId, recipe);
}

/** First grid visit this browser session (full reload clears module state). */
export function createInitialLastViewedTimestamps(): Record<string, number> {
  return getRecentlyViewedTimestamps();
}
