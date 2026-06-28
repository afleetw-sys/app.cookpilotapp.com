import type { RecipeData, RecipeThemeSeedColors } from "@/lib/cookpilot/types";

export const IMPORT_DRAFT_SEARCH_PARAM = "draft";

// Marks a draft that arrived from a shared/referral link (cookpilotapp.com/r/...).
// These recipes come over complete, so the detail page saves them immediately and
// lands the user in view state instead of edit mode. URL-paste imports omit this.
export const SHARED_IMPORT_SEARCH_PARAM = "fromShare";

type ImportDraftPayload = {
  recipe: RecipeData;
  sourceURL: string | null;
  themeSeedColors?: RecipeThemeSeedColors | null;
  notice?: string | null;
  // shareId of the `sharedRecipes` doc this draft was imported from, if any.
  // Used to record the importer once the recipe is saved to the library.
  shareId?: string | null;
};

function draftKey(recipeId: string) {
  return `cookpilot.importDraft.${recipeId}`;
}

export function savePendingImportDraft(
  recipeId: string,
  recipe: RecipeData,
  sourceURL: string | null,
  themeSeedColors?: RecipeThemeSeedColors | null,
  shareId?: string | null,
  notice?: string | null,
): void {
  try {
    sessionStorage.setItem(draftKey(recipeId), JSON.stringify({
      recipe,
      sourceURL,
      themeSeedColors: themeSeedColors ?? null,
      notice: notice ?? null,
      shareId: shareId ?? null,
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
