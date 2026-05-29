import type { Ingredient, RecipeData } from "@/lib/cookpilot/types";

function normalizeAmountString(value?: string | null): string | null {
  if (!value?.trim()) return value ?? null;

  let normalized = value.trim();
  const unicodeFractions: Record<string, string> = {
    "¼": " 1/4",
    "½": " 1/2",
    "¾": " 3/4",
    "⅓": " 1/3",
    "⅔": " 2/3",
    "⅛": " 1/8",
    "⅜": " 3/8",
    "⅝": " 5/8",
    "⅞": " 7/8",
  };

  for (const [fraction, replacement] of Object.entries(unicodeFractions)) {
    normalized = normalized.replaceAll(fraction, replacement);
  }

  normalized = normalized
    .replaceAll("⁄", "/")
    .replaceAll("／", "/")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function parseFraction(token: string): number | null {
  const parts = token.split("/");
  if (parts.length !== 2) return null;

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function parseAmount(value?: string | null): number | null {
  const normalized = normalizeAmountString(value);
  if (!normalized) return null;

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

function formatFraction(value: number): string | null {
  const tolerance = 0.01;
  const denominators = [2, 3, 4, 6, 8, 16];
  const whole = Math.trunc(value);
  const fractional = value - whole;

  for (const denominator of denominators) {
    const numerator = Math.round(fractional * denominator);
    if (numerator > 0 && numerator < denominator) {
      const candidate = numerator / denominator;
      if (Math.abs(candidate - fractional) < tolerance) {
        return whole > 0
          ? `${whole} ${numerator}/${denominator}`
          : `${numerator}/${denominator}`;
      }
    }
  }

  return null;
}

function formatAmount(value: number): string {
  if (Math.abs(value) < 0.001) return "0";
  if (Math.abs(Math.round(value) - value) < 0.001) return `${Math.round(value)}`;

  const fraction = formatFraction(value);
  if (fraction) return fraction;

  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return `${rounded}`.replace(/\.0$/, "");
}

export function scaleIngredientAmount(
  amount: string | null | undefined,
  multiplier: number,
): string | null | undefined {
  if (!amount?.trim()) return amount;
  if (Math.abs(multiplier - 1) < 0.001) return amount;

  const numeric = parseAmount(amount);
  if (numeric === null) return amount;

  return formatAmount(numeric * multiplier);
}

export function scaleIngredient(
  ingredient: Ingredient,
  multiplier: number,
): Ingredient {
  return {
    ...ingredient,
    amount: scaleIngredientAmount(ingredient.amount, multiplier) ?? ingredient.amount,
  };
}

export function scaleRecipe(recipe: RecipeData, servings: number): RecipeData {
  const originalServings = recipe.servings;
  if (!originalServings || originalServings <= 0 || servings <= 0) {
    return recipe;
  }

  const multiplier = servings / originalServings;

  return {
    ...recipe,
    servings,
    ingredientSections: recipe.ingredientSections.map((section) => ({
      ...section,
      ingredients: section.ingredients.map((ingredient) =>
        scaleIngredient(ingredient, multiplier),
      ),
    })),
  };
}
