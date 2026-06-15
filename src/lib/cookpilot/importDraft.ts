import type { RecipeData, RecipeThemeSeedColors } from "@/lib/cookpilot/types";

export const IMPORT_DRAFT_SEARCH_PARAM = "draft";

type ImportDraftPayload = {
  recipe: RecipeData;
  sourceURL: string | null;
  themeSeedColors?: RecipeThemeSeedColors | null;
};

function draftKey(recipeId: string) {
  return `cookpilot.importDraft.${recipeId}`;
}

export function savePendingImportDraft(
  recipeId: string,
  recipe: RecipeData,
  sourceURL: string | null,
  themeSeedColors?: RecipeThemeSeedColors | null,
): void {
  try {
    sessionStorage.setItem(draftKey(recipeId), JSON.stringify({
      recipe,
      sourceURL,
      themeSeedColors: themeSeedColors ?? null,
    }));
  } catch {
    // sessionStorage unavailable (private browsing quota, etc.) — import will fall back to immediate save
  }
}

export function loadPendingImportDraft(recipeId: string): ImportDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(draftKey(recipeId));
    if (!raw) return null;
    return JSON.parse(raw) as ImportDraftPayload;
  } catch {
    return null;
  }
}

export function clearPendingImportDraft(recipeId: string): void {
  try {
    sessionStorage.removeItem(draftKey(recipeId));
  } catch {
    // ignore
  }
}
