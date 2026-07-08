import { savePendingImportDraft } from "@/lib/cookpilot/importDraft";
import { importRecipeFromURL } from "@/lib/cookpilot/importRecipe";
import {
  decodeFirestoreDocument,
  fetchFirestoreDocument,
  parseCookPilotShareKey,
  resolveCanonicalShareId,
  SHARE_RECIPE_PAYLOAD_FIELD,
  SHARE_SOURCE_URL_FIELD,
  SHARED_RECIPES_COLLECTION,
} from "@/lib/cookpilot/sharedRecipeFirestore";
import type { RecipeData, SharedRecipePayload } from "@/lib/cookpilot/types";

export { parseCookPilotShareKey };
export const parseCookPilotShareId = parseCookPilotShareKey;

/**
 * Generates a client-reserved share id. Matches iOS `ShareLinkService.newShareId`
 * and the Cloud Function's `newShareId` (16 hex chars), so a link can be shown
 * before the doc is committed. Random per call — two people sharing the same
 * recipe always get distinct ids.
 */
export function newShareId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function ingredientCount(recipe: RecipeData): number {
  return recipe.ingredientSections.reduce(
    (count, section) => count + section.ingredients.length,
    0,
  );
}

function instructionCount(recipe: RecipeData): number {
  return recipe.instructionSections.reduce(
    (count, section) => count + section.instructions.length,
    0,
  );
}

function isValidSharedRecipePayload(value: unknown): value is SharedRecipePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as SharedRecipePayload;
  if (!payload.recipe || typeof payload.recipe !== "object") return false;
  return ingredientCount(payload.recipe) > 0 && instructionCount(payload.recipe) > 0;
}

export type SharedRecipeImportSnapshot = {
  kind: "snapshot";
  recipeId: string;
};

export type SharedRecipeImportLegacy = {
  kind: "legacy";
  sourceURL: string;
};

export type SharedRecipeImportResult =
  | SharedRecipeImportSnapshot
  | SharedRecipeImportLegacy;

export async function resolveSharedRecipeImport(
  shareKey: string,
): Promise<SharedRecipeImportResult | null> {
  const shareId = await resolveCanonicalShareId(shareKey);
  if (!shareId) return null;

  const data = decodeFirestoreDocument(
    await fetchFirestoreDocument([SHARED_RECIPES_COLLECTION, shareId]),
  );
  if (!data) return null;

  const recipePayload = data[SHARE_RECIPE_PAYLOAD_FIELD];
  if (isValidSharedRecipePayload(recipePayload)) {
    const recipeId = crypto.randomUUID();
    const recipeData: RecipeData = {
      ...recipePayload.recipe,
      localImagePath: null,
    };
    savePendingImportDraft(recipeId, recipeData, recipePayload.sourceURL ?? null, null, shareId);
    return { kind: "snapshot", recipeId };
  }

  const legacySourceURL = data[SHARE_SOURCE_URL_FIELD];
  if (typeof legacySourceURL === "string" && legacySourceURL.trim()) {
    return { kind: "legacy", sourceURL: legacySourceURL.trim() };
  }

  return null;
}

export async function importLegacySharedRecipe(sourceURL: string): Promise<string> {
  const imported = await importRecipeFromURL(sourceURL);
  const recipeId = crypto.randomUUID();
  savePendingImportDraft(recipeId, imported.recipe, sourceURL);
  return recipeId;
}

export function buildShareLinkPayload(recipe: RecipeData, sourceURL?: string | null) {
  // "photo_upload" is a local sentinel for "imported from a photo, no real
  // source URL" (see RecipeDetailPage) — the server only accepts http(s) URLs.
  const realSourceURL = sourceURL && sourceURL !== "photo_upload" ? sourceURL : null;
  const payload: SharedRecipePayload = {
    recipe: {
      ...recipe,
      localImagePath: null,
    },
    sourceURL: realSourceURL,
  };

  if (ingredientCount(payload.recipe) === 0 || instructionCount(payload.recipe) === 0) {
    throw new Error("Recipe must include ingredients and steps before sharing.");
  }

  return payload;
}

export async function savedRecipeFromSharedPayload(payload: SharedRecipePayload) {
  const { buildSavedRecipe } = await import("@/lib/cookpilot/firestore");
  return buildSavedRecipe({
    id: crypto.randomUUID(),
    recipe: {
      ...payload.recipe,
      localImagePath: null,
    },
    sourceURL: payload.sourceURL ?? null,
  });
}
