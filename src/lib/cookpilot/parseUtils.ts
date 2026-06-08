/**
 * Shared parsing primitives — fraction normalization, amount parsing.
 * Port of CookPilotCore IngredientAmountParser.swift + StringIngredientHelpers.swift.
 *
 * Keep this file free of UI / Firestore / React imports so it can be used
 * from scaling.ts, ingredientParsing.ts, and ingredientDisplay.ts alike.
 */

/** Replace unicode fraction characters with their ASCII equivalents. */
export function normalizeFractions(s: string): string {
  return s
    .replaceAll("¼", "1/4")
    .replaceAll("½", "1/2")
    .replaceAll("¾", "3/4")
    .replaceAll("⅓", "1/3")
    .replaceAll("⅔", "2/3")
    .replaceAll("⅛", "1/8")
    .replaceAll("⅜", "3/8")
    .replaceAll("⅝", "5/8")
    .replaceAll("⅞", "7/8")
    .replaceAll("⁄", "/")
    .replaceAll("／", "/");
}

/** Parse a "numerator/denominator" token to a number, or null if invalid. */
export function parseFraction(token: string): number | null {
  const parts = token.split("/");
  if (parts.length !== 2) return null;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

/**
 * Parse a free-form amount string to a number.
 * Handles unicode fractions ("¾"), mixed numbers ("1 1/2"), decimals ("2.5"),
 * and fraction-slash spacing ("1 / 2").
 * Returns null for empty or unparseable input.
 */
export function parseAmount(raw?: string | null): number | null {
  if (!raw?.trim()) return null;

  const normalized = normalizeFractions(raw.trim())
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  let total = 0;
  let found = false;

  for (const token of normalized.split(/\s+/)) {
    const fraction = parseFraction(token);
    if (fraction !== null) {
      total += fraction;
      found = true;
      continue;
    }
    const numeric = Number(token.replace(/[,.]$/, ""));
    if (Number.isFinite(numeric)) {
      total += numeric;
      found = true;
    }
  }

  return found ? total : null;
}
