import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/db";
import { savePendingImportDraft } from "@/lib/cookpilot/importDraft";
import { importRecipeFromURL } from "@/lib/cookpilot/importRecipe";
import { buildSavedRecipe } from "@/lib/cookpilot/firestore";
import type { RecipeData, SharedRecipePayload } from "@/lib/cookpilot/types";

const SHARED_RECIPES_COLLECTION = "sharedRecipes";
const SHARE_RECIPE_PAYLOAD_FIELD = "recipe";
const SHARE_SOURCE_URL_FIELD = "sourceURL";

export function parseCookPilotShareId(rawURL: string): string | null {
  const trimmed = rawURL.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host !== "cookpilotapp.com" && host !== "www.cookpilotapp.com") {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if ((parts[0] === "r" || parts[0] === "shared") && parts[1]) {
      return parts[1];
    }
  } catch {
    return null;
  }

  return null;
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
  shareId: string,
): Promise<SharedRecipeImportResult | null> {
  if (!shareId.trim() || shareId.length > 64) return null;

  const snapshot = await getDoc(doc(db, SHARED_RECIPES_COLLECTION, shareId));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const recipePayload = data[SHARE_RECIPE_PAYLOAD_FIELD];
  if (isValidSharedRecipePayload(recipePayload)) {
    const recipeId = crypto.randomUUID();
    const recipeData: RecipeData = {
      ...recipePayload.recipe,
      localImagePath: null,
    };
    savePendingImportDraft(recipeId, recipeData, recipePayload.sourceURL ?? null);
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
  const payload: SharedRecipePayload = {
    recipe: {
      ...recipe,
      localImagePath: null,
    },
    sourceURL: sourceURL ?? null,
  };

  if (ingredientCount(payload.recipe) === 0 || instructionCount(payload.recipe) === 0) {
    throw new Error("Recipe must include ingredients and steps before sharing.");
  }

  return payload;
}

export function savedRecipeFromSharedPayload(payload: SharedRecipePayload) {
  return buildSavedRecipe({
    id: crypto.randomUUID(),
    recipe: {
      ...payload.recipe,
      localImagePath: null,
    },
    sourceURL: payload.sourceURL ?? null,
  });
}
