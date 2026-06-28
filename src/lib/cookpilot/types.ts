export type ConfidenceLevel = "high" | "medium" | "low";
export type EditOutcome = "success" | "partialSuccess" | "refused";

export type RecipeThemeSeedColors = {
  primaryH: number;
  primaryS: number;
  primaryB: number;
  secondaryH: number;
  secondaryS: number;
  secondaryB: number;
};

export type Ingredient = {
  id: string;
  amount?: string | null;
  unit?: string | null;
  name: string;
  notes?: string | null;
};

export type Instruction = {
  id: string;
  stepNumber: number;
  text: string;
};

export type IngredientSection = {
  id: string;
  title?: string | null;
  ingredients: Ingredient[];
};

export type InstructionSection = {
  id: string;
  title?: string | null;
  instructions: Instruction[];
};

export type RecipeData = {
  schemaVersion?: number;
  title?: string | null;
  description?: string | null;
  servings?: number | null;
  prepTime?: string | null;
  cookTime?: string | null;
  ingredientSections: IngredientSection[];
  instructionSections: InstructionSection[];
  imageURL?: string | null;
  localImagePath?: string | null;
  tags?: string[];
  systemTags?: string[];
  nutrition?: unknown;
  aiChangesSummary?: string | null;
  aiConfidence?: ConfidenceLevel | null;
  aiConfidenceReason?: string | null;
};

export type RecipeSummary = {
  id: string;
  title?: string | null;
  imageURL?: string | null;
  localImagePath?: string | null;
  sourceURL?: string | null;
  createdAt: Date;
  preferredServings?: number | null;
  servings?: number | null;
  ingredientNames: string[];
  totalTimeMinutes?: number | null;
  tags: string[];
  systemTags: string[];
  themeSeedColors?: RecipeThemeSeedColors | null;
};

export type RecipeDetailDocument = {
  schemaVersion?: number;
  description?: string | null;
  prepTime?: string | null;
  cookTime?: string | null;
  ingredientSections: IngredientSection[];
  instructionSections: InstructionSection[];
  nutrition?: unknown;
  checkedIngredientIndices?: number[] | Record<string, never>;
  preferredIngredientMeasurementRaw?: string | null;
  storageSchemaVersion?: number;
};

export type SavedRecipe = {
  id: string;
  recipe: RecipeData;
  sourceURL?: string | null;
  createdAt: Date;
  preferredServings?: number | null;
  checkedIngredientIndices?: number[];
  preferredIngredientMeasurementRaw?: string | null;
  ingredientNames: string[];
  totalTimeMinutes?: number | null;
  themeSeedColors?: RecipeThemeSeedColors | null;
  importNotice?: string | null;
};

export type RecipePageCursor = {
  createdAt: Date;
  id: string;
};

export type RecipePage = {
  recipes: RecipeSummary[];
  nextCursor: RecipePageCursor | null;
  totalCount: number | null;
};

export type EditDeltaSummary = {
  ingredientChanges: number;
  instructionChanges: number;
  metadataChanges: number;
};

export type EditRecipeResponse = {
  recipe: RecipeData;
  versionId: string;
  outcome: EditOutcome;
  changesSummary: string;
  confidence: ConfidenceLevel;
  confidenceReason: string;
  deltaSummary: EditDeltaSummary;
  refusalReason?: string;
};

export type AuthStatus = "loading" | "signedOut" | "anonymous" | "authenticated";

export type SharedRecipePayload = {
  recipe: RecipeData;
  sourceURL?: string | null;
};

export type ShareLinkResult = {
  shareId: string;
  shareURL: string;
};
