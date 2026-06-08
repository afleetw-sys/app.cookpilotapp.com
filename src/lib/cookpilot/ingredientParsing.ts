// Port of CookPilotCore/Sources/CookPilotCore/Parsing/StringIngredientHelpers.swift
// and RecipeParsingHelpers.splitNameAndNotes

import type { Ingredient } from "@/lib/cookpilot/types";
import { normalizeFractions } from "@/lib/cookpilot/parseUtils";

// Keep in sync with UNITS aliases in ingredientDisplay.ts
const ALL_UNIT_ALIASES = new Set([
  "cup", "cups", "c",
  "tablespoon", "tablespoons", "tbsp", "t",
  "teaspoon", "teaspoons", "tsp",
  "fl oz", "fl. oz.", "floz",
  "pint", "pints", "pt",
  "quart", "quarts", "qt",
  "gallon", "gallons", "gal",
  "pound", "pounds", "lb", "lbs",
  "ounce", "ounces", "oz",
  "liter", "liters", "litre", "litres", "l",
  "milliliter", "milliliters", "millilitre", "millilitres", "ml",
  "deciliter", "deciliters", "decilitre", "decilitres", "dl",
  "centiliter", "centiliters", "centilitre", "centilitres", "cl",
  "kilogram", "kilograms", "kg",
  "gram", "grams", "g",
  "pinch", "pinches",
  "dash", "dashes",
  "clove", "cloves",
  "can", "cans",
  "package", "packages", "pkg", "pkgs",
]);

const APPROXIMATION_PREFIXES = ["≈", "about ", "approx. ", "approximately "];

const PRESERVED_LABEL_PREFIXES = ["optional", "garnish", "for serving", "to serve"];

const PREPARATION_ADJECTIVES = new Set([
  "skinless", "boneless", "deboned", "deveined", "peeled", "trimmed",
  "diced", "minced", "chopped", "sliced", "halved", "quartered",
  "shredded", "grated", "frozen", "thawed", "cooked", "raw",
  "dried", "fresh", "rinsed", "drained", "crushed", "pressed",
  "toasted", "roasted", "ground", "whole", "pitted", "seeded",
  "hulled", "blanched", "parboiled", "julienned", "cubed", "crumbled",
]);

type ParsedIngredient = { amount: string | null; unit: string | null; name: string };

/** Build the single-line display string for an ingredient (used as the text field value). */
export function ingredientDisplayLine(ingredient: Ingredient): string {
  const parts = [ingredient.amount, ingredient.unit, ingredient.name, ingredient.notes];
  return parts.filter((p) => p?.trim()).join(" ");
}

/**
 * Parse a free-form ingredient string into structured fields.
 * Handles amount-first ("2 cups flour"), name-first ("flour, 2 cups"),
 * attached units ("200g spaghetti"), and name-last ("Diced chicken 2 cups").
 * Also splits notes out of the name via comma syntax ("garlic, minced").
 */
export function parseIngredientText(raw: string): Omit<Ingredient, "id"> {
  const parsed = parseIngredientWithNameFirst(raw);
  const { name, notes } = splitNameAndNotes(parsed.name);
  return {
    amount: parsed.amount ?? null,
    unit: parsed.unit ?? null,
    name,
    notes: notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------


function stripApproximationPrefix(s: string): string {
  for (const prefix of APPROXIMATION_PREFIXES) {
    if (s.startsWith(prefix)) return s.slice(prefix.length).trimStart();
  }
  return s;
}

/** If the token is a number glued to a unit (e.g. "200g"), split them. */
function splitAttachedAmountAndUnit(token: string): { amount: string; unit: string } | null {
  const patterns = [
    /^(\d+(?:\.\d+)?|\d+\/\d+)([A-Za-z]+)$/,
    /^(\d+\s+\d+\/\d+)([A-Za-z]+)$/,
  ];
  for (const pattern of patterns) {
    const m = token.match(pattern);
    if (!m) continue;
    const unit = m[2];
    if (!ALL_UNIT_ALIASES.has(unit.toLowerCase())) continue;
    return { amount: m[1], unit };
  }
  return null;
}

const COMPOUND_SEPARATOR = /(?:\s*\+\s*|\s+plus\s+|\s+and\s+|\s*&\s*|\s+with\s+)/i;
const HAS_NUMBER = /[0-9/]/;
const AMOUNT_PATTERN = /^\d+(?:\s*-\s*\d+)?(?:\s+\d+\/\d+)?$|^\d+\/\d+$|^\d+(?:\.\d+)?$/;

function hasCompoundMeasurements(trimmed: string): boolean {
  const m = COMPOUND_SEPARATOR.exec(trimmed);
  if (!m) return false;
  const before = trimmed.slice(0, m.index).trim();
  const after = trimmed.slice(m.index + m[0].length).trim();
  return HAS_NUMBER.test(before) && HAS_NUMBER.test(after);
}

function parseIngredient(raw: string): ParsedIngredient {
  let normalized = normalizeFractions(raw).trim();
  const hadTilde = normalized.startsWith("~");
  if (hadTilde) normalized = normalized.slice(1).trimStart();
  const trimmed = stripApproximationPrefix(normalized);

  const tilde = (amount: string | null) => (hadTilde && amount ? `~${amount}` : amount);

  if (trimmed.includes("+") || trimmed.includes("&")) {
    return { amount: null, unit: null, name: hadTilde ? `~${trimmed}` : trimmed };
  }
  if (hasCompoundMeasurements(trimmed)) {
    return { amount: null, unit: null, name: hadTilde ? `~${trimmed}` : trimmed };
  }

  const parts = trimmed.split(" ");
  if (parts.length === 0) return { amount: null, unit: null, name: "" };

  const firstPart = parts[0];

  const attached = splitAttachedAmountAndUnit(firstPart);
  if (attached) {
    return { amount: tilde(attached.amount), unit: attached.unit, name: parts.slice(1).join(" ") };
  }

  if (!AMOUNT_PATTERN.test(firstPart) || parts.length < 2) {
    return { amount: null, unit: null, name: hadTilde ? `~${trimmed}` : trimmed };
  }

  let amount = firstPart;
  let unitIndex = 1;

  // Mixed number: "1 1/2"
  if (parts.length >= 3) {
    const second = parts[1];
    if (second.includes("/") && !/[^0-9/]/.test(second)) {
      amount = `${firstPart} ${second}`;
      unitIndex = 2;
    }
  }

  if (unitIndex < parts.length) {
    const potentialUnit = parts[unitIndex].toLowerCase();
    if (ALL_UNIT_ALIASES.has(potentialUnit)) {
      return { amount: tilde(amount), unit: parts[unitIndex], name: parts.slice(unitIndex + 1).join(" ") };
    }
    return { amount: tilde(amount), unit: null, name: parts.slice(unitIndex).join(" ") };
  }

  return { amount: tilde(amount), unit: null, name: "" };
}

function shouldPreservePrefixedLabel(s: string): boolean {
  const lower = s.toLowerCase();
  return PRESERVED_LABEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function parseIngredientWithNameFirst(raw: string): ParsedIngredient {
  let normalized = normalizeFractions(raw).trim();
  const hadTilde = normalized.startsWith("~");
  if (hadTilde) normalized = normalized.slice(1).trimStart();
  const trimmed = stripApproximationPrefix(normalized);

  const tilde = (amount: string | null) => (hadTilde && amount ? `~${amount}` : amount);
  const passthrough: ParsedIngredient = { amount: null, unit: null, name: hadTilde ? `~${trimmed}` : trimmed };

  if (trimmed.includes("+") || trimmed.includes("&")) return passthrough;
  if (hasCompoundMeasurements(trimmed)) return passthrough;
  if (shouldPreservePrefixedLabel(trimmed)) return passthrough;

  // Comma-separated: "Name, amount [unit]"
  if (trimmed.includes(",")) {
    const commaIdx = trimmed.indexOf(",");
    const namePart = trimmed.slice(0, commaIdx).trim();
    const amountPart = trimmed.slice(commaIdx + 1).trim();
    if (HAS_NUMBER.test(amountPart)) {
      const amountWords = amountPart.split(" ");
      const firstWord = amountWords[0];
      if (firstWord && HAS_NUMBER.test(firstWord)) {
        const attached = splitAttachedAmountAndUnit(firstWord);
        if (attached) return { amount: tilde(attached.amount), unit: attached.unit, name: namePart };

        let amount = firstWord;
        let unitIndex = 1;
        if (amountWords.length >= 2) {
          const second = amountWords[1];
          if (second.includes("/") && !/[^0-9/]/.test(second)) {
            amount = `${firstWord} ${second}`;
            unitIndex = 2;
          }
        }
        if (unitIndex < amountWords.length && ALL_UNIT_ALIASES.has(amountWords[unitIndex].toLowerCase())) {
          return { amount: tilde(amount), unit: amountWords[unitIndex], name: namePart };
        }
        return { amount: tilde(amount), unit: null, name: namePart };
      }
    }
  }

  // Space-separated name-first: "Diced chicken 2 cups" or "Chicken Breasts 2"
  const words = trimmed.split(" ");
  if (words.length >= 2 && !HAS_NUMBER.test(words[0])) {
    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i];
      if (!HAS_NUMBER.test(word)) continue;

      // Skip numbers inside unmatched parentheses
      const prefix = words.slice(0, i).join(" ");
      const openParens = (prefix.match(/\(/g) ?? []).length;
      const closeParens = (prefix.match(/\)/g) ?? []).length;
      if (openParens > closeParens) continue;

      // Must be at end or immediately before a known unit
      const isLast = i === words.length - 1;
      const isBeforeUnit = i === words.length - 2 && ALL_UNIT_ALIASES.has(words[i + 1].toLowerCase());
      if (!isLast && !isBeforeUnit) continue;

      // Skip mixed number components (the "1" in "1 1/2")
      if (word.includes("/") && i > 0) {
        const prev = words[i - 1];
        if (!/\D/.test(prev)) break;
      }

      // "X of Y" pattern: "Juice of 1 lemon"
      if (i >= 1 && words[i - 1].toLowerCase() === "of") {
        const ofUnit = words[0];
        const namePart = words.slice(i + 1).join(" ");
        if (namePart) return { amount: tilde(word), unit: ofUnit, name: namePart };
        const fallback = [...words.slice(0, i - 1), ...words.slice(i + 1)].join(" ");
        if (fallback) return { amount: tilde(word), unit: null, name: fallback };
        continue;
      }

      const attached = splitAttachedAmountAndUnit(word);
      const amount = attached?.amount ?? word;
      let unit: string | null = null;
      let nameWords: string[];

      if (attached) {
        unit = attached.unit;
        nameWords = words.slice(0, i);
      } else if (i + 1 < words.length && ALL_UNIT_ALIASES.has(words[i + 1].toLowerCase())) {
        unit = words[i + 1];
        nameWords = words.slice(0, i);
      } else {
        nameWords = words.slice(0, i);
      }

      const name = nameWords.join(" ");
      if (name) return { amount: tilde(amount), unit, name };
    }
  }

  return parseIngredient(raw);
}

/**
 * Split a parsed ingredient name into (name, notes) using comma syntax.
 * "garlic, minced" → { name: "garlic", notes: "minced" }
 * "diced, 2 cups" — comma before amount falls through to no-split.
 */
function splitNameAndNotes(name: string): { name: string; notes: string | null } {
  const trimmed = name.trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) return { name: trimmed, notes: null };

  const namePart = trimmed.slice(0, commaIdx).trim();
  const notesPart = trimmed.slice(commaIdx + 1).trim();

  if (!notesPart) return { name: trimmed, notes: null };

  // If the part before the comma is a single preparation adjective, keep it joined
  // e.g. "diced, chicken thighs" should stay as-is (unlikely but matches Swift behaviour)
  if (!namePart.includes(" ") && PREPARATION_ADJECTIVES.has(namePart.toLowerCase())) {
    return { name: `${namePart} ${notesPart}`, notes: null };
  }

  return { name: namePart || trimmed, notes: notesPart };
}
