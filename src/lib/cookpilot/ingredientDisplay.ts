import type { Ingredient } from "@/lib/cookpilot/types";
import { parseAmount } from "@/lib/cookpilot/parseUtils";

export type MeasurementMode = "original" | "cups" | "metricDisplay";
export type RecipeIngredientMeasurementDominance =
  | "predominantlyMetric"
  | "predominantlyImperial"
  | "mixed";

type MeasurementSystem = "imperial" | "metric" | "count" | "other";
type UnitCategory = "volume" | "weight" | "count" | "other";

type MeasurementUnit = {
  id: string;
  aliases: string[];
  system: MeasurementSystem;
  category: UnitCategory;
  conversionFactor?: number;
};

const UNITS: MeasurementUnit[] = [
  { id: "cup", aliases: ["cup", "cups", "c"], system: "imperial", category: "volume", conversionFactor: 236.588 },
  { id: "tablespoon", aliases: ["tablespoon", "tablespoons", "tbsp", "t"], system: "imperial", category: "volume", conversionFactor: 14.7868 },
  { id: "teaspoon", aliases: ["teaspoon", "teaspoons", "tsp"], system: "imperial", category: "volume", conversionFactor: 4.92892 },
  { id: "fluid_ounce", aliases: ["fl oz", "fl. oz.", "floz"], system: "imperial", category: "volume", conversionFactor: 29.5735 },
  { id: "pint", aliases: ["pint", "pints", "pt"], system: "imperial", category: "volume", conversionFactor: 473.176 },
  { id: "quart", aliases: ["quart", "quarts", "qt"], system: "imperial", category: "volume", conversionFactor: 946.353 },
  { id: "gallon", aliases: ["gallon", "gallons", "gal"], system: "imperial", category: "volume", conversionFactor: 3785.41 },
  { id: "pound", aliases: ["pound", "pounds", "lb", "lbs"], system: "imperial", category: "weight", conversionFactor: 453.592 },
  { id: "ounce_weight", aliases: ["ounce", "ounces", "oz"], system: "imperial", category: "weight", conversionFactor: 28.3495 },
  { id: "liter", aliases: ["liter", "liters", "litre", "litres", "l"], system: "metric", category: "volume", conversionFactor: 1000 },
  { id: "milliliter", aliases: ["milliliter", "milliliters", "millilitre", "millilitres", "ml"], system: "metric", category: "volume", conversionFactor: 1 },
  { id: "deciliter", aliases: ["deciliter", "deciliters", "decilitre", "decilitres", "dl"], system: "metric", category: "volume", conversionFactor: 100 },
  { id: "centiliter", aliases: ["centiliter", "centiliters", "centilitre", "centilitres", "cl"], system: "metric", category: "volume", conversionFactor: 10 },
  { id: "kilogram", aliases: ["kilogram", "kilograms", "kg"], system: "metric", category: "weight", conversionFactor: 1000 },
  { id: "gram", aliases: ["gram", "grams", "g"], system: "metric", category: "weight", conversionFactor: 1 },
  { id: "pinch", aliases: ["pinch", "pinches"], system: "other", category: "other" },
  { id: "dash", aliases: ["dash", "dashes"], system: "other", category: "other" },
  { id: "clove", aliases: ["clove", "cloves"], system: "count", category: "count" },
  { id: "can", aliases: ["can", "cans"], system: "count", category: "count" },
  { id: "package", aliases: ["package", "packages", "pkg", "pkgs"], system: "count", category: "count" },
];

const UNITS_WITH_OF_DISPLAY = new Set(["zest", "juice"]);

/**
 * Liquid ingredient keywords — longest entries first so more specific phrases
 * match before their substrings (e.g. "olive oil" before "oil").
 * Port of IngredientMetricVolumeConversion.liquidKeywordsLongestFirst (iOS).
 */
const LIQUID_KEYWORDS: string[] = [
  "half and half", "sweetened condensed milk", "evaporated milk", "vanilla extract",
  "almond extract", "maple syrup", "corn syrup", "simple syrup",
  "chicken broth", "beef broth", "vegetable broth",
  "coconut milk", "almond milk", "oat milk", "soy milk", "cashew milk",
  "olive oil", "vegetable oil", "coconut oil", "sesame oil", "canola oil", "avocado oil",
  "soy sauce", "fish sauce", "hot sauce", "worcestershire",
  "apple juice", "orange juice", "lemon juice", "lime juice", "pineapple juice",
  "tomato juice", "cranberry juice",
  "tomato sauce", "tomato paste",
  "heavy cream", "light cream", "sour cream",
  "chicken stock", "beef stock", "vegetable stock",
  "buttermilk", "liqueur",
  "broth", "stock", "extract", "rum", "vodka", "whiskey", "brandy", "gin", "tequila",
  "water", "milk", "cream", "oil", "juice", "vinegar", "wine", "beer", "soda",
  "yogurt", "kefir", "honey", "molasses", "tea", "coffee", "espresso", "kombucha",
].sort((a, b) => b.length - a.length);

/**
 * Approximate grams per US cup for common solid ingredients.
 * Longer keywords take precedence — keep more-specific entries before their substrings.
 * Port of IngredientMetricVolumeConversion.gramsPerUSCupTable (iOS).
 */
const GRAMS_PER_US_CUP_BY_KEYWORD: Array<{ keyword: string; grams: number }> = [
  { keyword: "all-purpose flour", grams: 120 },
  { keyword: "all purpose flour", grams: 120 },
  { keyword: "bread flour", grams: 120 },
  { keyword: "cake flour", grams: 100 },
  { keyword: "whole wheat flour", grams: 113 },
  { keyword: "wheat flour", grams: 120 },
  { keyword: "granulated sugar", grams: 200 },
  { keyword: "brown sugar", grams: 200 },
  { keyword: "powdered sugar", grams: 120 },
  { keyword: "confectioners sugar", grams: 120 },
  { keyword: "cocoa powder", grams: 85 },
  { keyword: "rolled oats", grams: 90 },
  { keyword: "quick oats", grams: 90 },
  { keyword: "cornstarch", grams: 128 },
  { keyword: "cornmeal", grams: 138 },
  { keyword: "breadcrumbs", grams: 108 },
  { keyword: "chocolate chips", grams: 170 },
  { keyword: "chopped walnuts", grams: 117 },
  { keyword: "chopped almonds", grams: 142 },
  { keyword: "shredded coconut", grams: 75 },
  { keyword: "shredded cheese", grams: 113 },
  { keyword: "cream cheese", grams: 232 },
  { keyword: "long-grain rice", grams: 185 },
  { keyword: "shortening", grams: 191 },
  { keyword: "butter", grams: 227 },
  { keyword: "flour", grams: 120 },
  { keyword: "sugar", grams: 200 },
  { keyword: "oats", grams: 90 },
  { keyword: "rice", grams: 185 },
  { keyword: "parmesan", grams: 100 },
];

export function measurementModeTitle(mode: MeasurementMode): string {
  switch (mode) {
    case "original":
      return "Original";
    case "cups":
      return "Cups";
    case "metricDisplay":
      return "Metric";
  }
}

export function measurementModeFromRaw(raw?: string | null): MeasurementMode {
  if (raw === "cups" || raw === "metricDisplay" || raw === "original") return raw;
  return "original";
}

export function showConvertedMeasurements(
  modeRaw: string | null | undefined,
  dominance: RecipeIngredientMeasurementDominance,
): boolean {
  const mode = measurementModeFromRaw(modeRaw);
  switch (mode) {
    case "original":
      return false;
    case "cups":
      return dominance === "predominantlyMetric";
    case "metricDisplay":
      return dominance === "predominantlyImperial" || dominance === "mixed";
  }
}

export function recipeIngredientMeasurementDominance(
  ingredients: Ingredient[],
): RecipeIngredientMeasurementDominance {
  let metricCount = 0;
  let imperialCount = 0;

  for (const ingredient of ingredients) {
    const unit = resolveUnit(ingredient.unit);
    if (!unit) continue;
    if (unit.system === "metric") metricCount += 1;
    if (unit.system === "imperial") imperialCount += 1;
  }

  if (metricCount === 0 && imperialCount === 0) return "mixed";
  if (metricCount > imperialCount) return "predominantlyMetric";
  if (imperialCount > metricCount) return "predominantlyImperial";
  return "mixed";
}

export function displayIngredient(
  ingredient: Ingredient,
  dominance: RecipeIngredientMeasurementDominance,
  showConverted: boolean,
): string {
  if (!showConverted) return originalIngredientLine(ingredient);
  if (dominance === "predominantlyMetric") {
    return imperialConvertedDisplayLine(ingredient) ?? originalIngredientLine(ingredient);
  }
  return metricConvertedDisplayLine(ingredient) ?? originalIngredientLine(ingredient);
}

function originalIngredientLine(ingredient: Ingredient): string {
  return [ingredient.amount, ingredient.unit, ingredient.name, ingredient.notes]
    .filter((value) => Boolean(value?.trim()))
    .join(" ");
}

function metricConvertedDisplayLine(ingredient: Ingredient): string | null {
  const amount = parseAmount(ingredient.amount);
  const unit = resolveUnit(ingredient.unit);
  if (!amount || !unit || UNITS_WITH_OF_DISPLAY.has((ingredient.unit ?? "").toLowerCase())) return null;

  if (unit.id === "tablespoon" || unit.id === "teaspoon") {
    const ml = roundDisplayValue(amount * (unit.id === "tablespoon" ? 15 : 5));
    return withNotes(`${formatDisplayValue(ml)} ml ${ingredient.name}`, ingredient.notes);
  }

  if (unit.category === "volume" && unit.conversionFactor) {
    const ml = amount * unit.conversionFactor;
    const gramsPerCup = lookupGramsPerCup(ingredient.name);
    if (gramsPerCup) {
      const grams = roundDisplayValue(ml * (gramsPerCup / 236.588));
      return withNotes(`${formatDisplayValue(grams)} g ${ingredient.name}`, ingredient.notes);
    }
    return withNotes(`${formatDisplayValue(roundDisplayValue(ml))} ml ${ingredient.name}`, ingredient.notes);
  }

  if (unit.category === "weight" && unit.conversionFactor) {
    const grams = amount * unit.conversionFactor;
    return withNotes(`${formatDisplayValue(roundDisplayValue(grams))} g ${ingredient.name}`, ingredient.notes);
  }

  return null;
}

function imperialConvertedDisplayLine(ingredient: Ingredient): string | null {
  const amount = parseAmount(ingredient.amount);
  const unit = resolveUnit(ingredient.unit);
  if (!amount || !unit || UNITS_WITH_OF_DISPLAY.has((ingredient.unit ?? "").toLowerCase())) return null;

  if (unit.system !== "metric" || !unit.conversionFactor) return null;

  if (unit.category === "weight") {
    const grams = amount * unit.conversionFactor;
    if (grams >= 453.592) {
      return withNotes(`${formatDisplayValue(roundDisplayValue(grams / 453.592))} lb ${ingredient.name}`, ingredient.notes);
    }
    return withNotes(`${formatDisplayValue(roundDisplayValue(grams / 28.3495))} oz ${ingredient.name}`, ingredient.notes);
  }

  if (unit.category === "volume") {
    const ml = amount * unit.conversionFactor;
    if (ml >= 710) {
      const quarts = roundDisplayValue(ml / 946.353);
      return withNotes(`${formatDisplayValue(quarts)} ${Math.abs(quarts - 1) < 0.06 ? "quart" : "quarts"} ${ingredient.name}`, ingredient.notes);
    }
    if (ml >= 59) {
      const cups = roundDisplayValue(ml / 236.588);
      return withNotes(`${formatDisplayValue(cups)} ${Math.abs(cups - 1) < 0.06 ? "cup" : "cups"} ${ingredient.name}`, ingredient.notes);
    }
    return withNotes(`${formatDisplayValue(roundDisplayValue(ml / 29.5735))} fl oz ${ingredient.name}`, ingredient.notes);
  }

  return null;
}

function withNotes(base: string, notes?: string | null): string {
  return notes?.trim() ? `${base} ${notes.trim()}` : base;
}

function isLiquidIngredient(name: string): boolean {
  const lower = name.toLowerCase();
  return LIQUID_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function lookupGramsPerCup(name: string): number | null {
  if (isLiquidIngredient(name)) return null;
  const lower = name.toLowerCase();
  const match = GRAMS_PER_US_CUP_BY_KEYWORD.find((entry) => lower.includes(entry.keyword));
  return match?.grams ?? null;
}

function resolveUnit(rawUnit?: string | null): MeasurementUnit | null {
  const normalized = rawUnit?.trim().toLowerCase();
  if (!normalized) return null;

  return UNITS.find((unit) => unit.aliases.some((alias) => alias.toLowerCase() === normalized)) ?? null;
}


function roundDisplayValue(value: number): number {
  if (value < 10) return Math.round(value * 10) / 10;
  return Math.round(value);
}

function formatDisplayValue(value: number): string {
  if (Math.abs(Math.round(value) - value) < 0.001) return `${Math.round(value)}`;
  return `${value}`.replace(/\.0$/, "");
}
