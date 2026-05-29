import type { Ingredient } from "@/lib/cookpilot/types";

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
const GRAMS_PER_US_CUP_BY_KEYWORD: Array<{ keyword: string; grams: number }> = [
  { keyword: "flour", grams: 120 },
  { keyword: "sugar", grams: 200 },
  { keyword: "brown sugar", grams: 220 },
  { keyword: "powdered sugar", grams: 120 },
  { keyword: "butter", grams: 227 },
  { keyword: "oats", grams: 90 },
  { keyword: "rice", grams: 185 },
  { keyword: "chocolate chips", grams: 170 },
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

function lookupGramsPerCup(name: string): number | null {
  const lower = name.toLowerCase();
  const match = GRAMS_PER_US_CUP_BY_KEYWORD.find((entry) => lower.includes(entry.keyword));
  return match?.grams ?? null;
}

function resolveUnit(rawUnit?: string | null): MeasurementUnit | null {
  const normalized = rawUnit?.trim().toLowerCase();
  if (!normalized) return null;

  return UNITS.find((unit) => unit.aliases.some((alias) => alias.toLowerCase() === normalized)) ?? null;
}

function parseAmount(raw?: string | null): number | null {
  const normalized = raw?.trim();
  if (!normalized) return null;

  let value = normalized
    .replaceAll("½", "1/2")
    .replaceAll("⅓", "1/3")
    .replaceAll("⅔", "2/3")
    .replaceAll("¼", "1/4")
    .replaceAll("¾", "3/4")
    .replaceAll("⅛", "1/8")
    .replaceAll("⅜", "3/8")
    .replaceAll("⅝", "5/8")
    .replaceAll("⅞", "7/8")
    .replaceAll("⁄", "/");

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && Number.isFinite(Number(parts[0])) && parts[1]?.includes("/")) {
    const whole = Number(parts[0]);
    const fraction = parseFraction(parts[1]);
    if (fraction !== null) return whole + fraction;
  }

  if (parts.length >= 1) {
    const fraction = parseFraction(parts[0]);
    if (fraction !== null) return fraction;
    const numeric = Number(parts[0]);
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

function parseFraction(raw: string): number | null {
  const parts = raw.split("/");
  if (parts.length !== 2) return null;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function roundDisplayValue(value: number): number {
  if (value < 10) return Math.round(value * 10) / 10;
  return Math.round(value);
}

function formatDisplayValue(value: number): string {
  if (Math.abs(Math.round(value) - value) < 0.001) return `${Math.round(value)}`;
  return `${value}`.replace(/\.0$/, "");
}
