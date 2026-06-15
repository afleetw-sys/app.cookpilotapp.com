import type { RecipeData } from "@/lib/cookpilot/types";

const GLUTEN_KEYWORDS = ["flour", "wheat", "bread", "pasta", "noodle", "soy sauce", "barley", "rye", "malt"];
const MEAT_KEYWORDS = ["chicken", "beef", "pork", "turkey", "lamb", "fish", "salmon", "tuna", "shrimp", "bacon", "sausage", "meat"];
const DAIRY_KEYWORDS = ["milk", "cheese", "butter", "cream", "yogurt", "sour cream"];
const SUGAR_KEYWORDS = ["sugar", "honey", "syrup", "maple", "molasses", "brown sugar", "powdered sugar"];
const SPICY_KEYWORDS = ["pepper", "chili", "chile", "cayenne", "paprika", "curry", "cumin", "ginger", "garlic"];
const UNHEALTHY_KEYWORDS = ["butter", "oil", "cream", "cheese", "bacon", "sausage", "fried"];
const HEALTHY_KEYWORDS = ["salad", "smoothie", "juice"];
const DESSERT_KEYWORDS = new Set([
  "dessert",
  "cake",
  "cookie",
  "pie",
  "pudding",
  "ice cream",
  "custard",
  "muffin",
  "brownie",
  "fudge",
  "sweet",
  "chocolate",
  "vanilla",
]);

const EMPTY_RECIPE_SUGGESTIONS = [
  "Create a chocolate chip cookie recipe",
  "Create a pasta recipe",
  "Create a salad recipe",
];

const EMPTY_IMPORTED_RECIPE_SUGGESTIONS = [
  "Turn my notes into a recipe",
  "Fill in ingredients and steps",
  "Create a complete recipe draft",
];

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function recipeIngredientNames(recipe: RecipeData) {
  return recipe.ingredientSections
    .flatMap((section) => section.ingredients)
    .map((ingredient) => ingredient.name.toLowerCase());
}

export function defaultAIEditSuggestions(
  recipe: RecipeData,
  options?: { sourceURL?: string | null },
): string[] {
  const hasContent = Boolean(
    recipe.title?.trim() ||
    recipe.ingredientSections.some((section) => section.ingredients.length > 0) ||
    recipe.instructionSections.some((section) => section.instructions.length > 0),
  );
  if (!hasContent) {
    return options?.sourceURL ? EMPTY_IMPORTED_RECIPE_SUGGESTIONS : EMPTY_RECIPE_SUGGESTIONS;
  }

  const ingredientNames = recipeIngredientNames(recipe);
  const titleDescription = `${recipe.title ?? ""} ${recipe.description ?? ""}`.toLowerCase();
  const combined = `${titleDescription} ${(recipe.tags ?? []).join(" ")}`.toLowerCase();
  const suggestions: string[] = [];

  if (ingredientNames.some((name) => includesAny(name, GLUTEN_KEYWORDS))) {
    suggestions.push("Make it gluten-free");
  }
  if (ingredientNames.some((name) => includesAny(name, MEAT_KEYWORDS) || includesAny(name, DAIRY_KEYWORDS))) {
    suggestions.push("Make it vegetarian");
  }
  if (ingredientNames.some((name) => includesAny(name, SUGAR_KEYWORDS))) {
    suggestions.push("Reduce sugar");
  }
  if (
    !Array.from(DESSERT_KEYWORDS).some((keyword) => combined.includes(keyword)) &&
    ingredientNames.some((name) => includesAny(name, SPICY_KEYWORDS))
  ) {
    suggestions.push("Make it spicier");
  }
  if (
    !HEALTHY_KEYWORDS.some((keyword) => titleDescription.includes(keyword)) &&
    ingredientNames.some((name) => includesAny(name, UNHEALTHY_KEYWORDS))
  ) {
    suggestions.push("Make it healthier");
  }

  return suggestions;
}
