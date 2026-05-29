const LOG_PREFIX = "[RecipeImage]";

export function isRecipeImageDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("cookpilot.recipeImageLoadDiagnostics") === "1";
  } catch {
    return false;
  }
}

export function redactedImageURL(url: string | null | undefined): string {
  if (!url?.trim()) return "nil";
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return `${parsed.host}/…/${last}`;
  } catch {
    return "invalid-url";
  }
}

export function logRecipeImageLoad(
  recipeId: string,
  event: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!isRecipeImageDiagnosticsEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.debug(LOG_PREFIX, recipeId, event, detail);
  } else {
    console.debug(LOG_PREFIX, recipeId, event);
  }
}
