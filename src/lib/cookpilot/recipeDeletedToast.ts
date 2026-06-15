const RECIPE_DELETED_TOAST_STORAGE_KEY = "cookpilot.recipeDeletedToast";

export function queueRecipeDeletedToast() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RECIPE_DELETED_TOAST_STORAGE_KEY, "1");
}

export function consumeRecipeDeletedToast(): boolean {
  if (typeof window === "undefined") return false;
  const shouldShow = window.sessionStorage.getItem(RECIPE_DELETED_TOAST_STORAGE_KEY) === "1";
  window.sessionStorage.removeItem(RECIPE_DELETED_TOAST_STORAGE_KEY);
  return shouldShow;
}
