/**
 * Normalizes user-pasted import URLs (matches iOS RecipeParserService).
 */
export function normalizeImportURL(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
