import type { Ingredient, RecipeData } from "@/lib/cookpilot/types";
import { parseAmount } from "@/lib/cookpilot/parseUtils";

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
  if (servings <= 0) {
    return recipe;
  }

  // Recipes without a detected serving count (common for imports) are treated
  // as a base of 4 servings, matching the iOS app's fallback, so the stepper
  // still scales ingredients instead of no-op'ing.
  const originalServings =
    recipe.servings && recipe.servings > 0 ? recipe.servings : 4;
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
