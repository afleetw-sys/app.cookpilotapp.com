import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/cloudFunctions";
import type { EditRecipeResponse, Ingredient, RecipeData, ShareLinkResult, SharedRecipePayload } from "@/lib/cookpilot/types";
import type { ClientRecipeExtraction } from "@/lib/cookpilot/clientExtraction";
import type { SocialPlatform } from "@/lib/cookpilot/socialPlatform";

type SocialParserPlatform = Exclude<SocialPlatform, "youtube"> | "other";

export type ParseRecipeFromUrlResponse = {
  recipe: RecipeData;
  parser?: {
    source: string;
    platform?: string;
    usedTranscriptFallback?: boolean;
    validation?: {
      stages: Array<{
        stage: "source-document" | "parsed-recipe" | "final-recipe-contract";
        status: "passed" | "failed";
      }>;
      failedStage?: "source-document" | "parsed-recipe" | "final-recipe-contract";
    };
  };
};

export type ParseSocialRecipeResponse = {
  recipe: RecipeData;
  parser?: {
    source: string;
    platform?: SocialParserPlatform;
    usedTranscriptFallback?: boolean;
    validation?: {
      stages: Array<{
        stage: "source-document" | "parsed-recipe" | "final-recipe-contract";
        status: "passed" | "failed";
      }>;
      failedStage?: "source-document" | "parsed-recipe" | "final-recipe-contract";
    };
  };
};

export type ParseSocialRecipeRequest = {
  platform: SocialParserPlatform;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  transcript?: string | null;
  imageURL?: string | null;
  sourceURL?: string | null;
  importSessionID?: string;
};

export type ParseRecipeFromURLRequest = {
  url: string;
  importSessionID?: string;
} & ClientRecipeExtraction;

export type ParseRecipeFromImagesResponse = {
  recipe: RecipeData;
  usage?: unknown;
  ocrText?: string;
  usedAIAssist?: boolean;
  deterministicStrong?: boolean;
};

export type ParseRecipeFromImagesRequest = {
  images: string[];
};

type ParseRecipeFromImagesCallableResponse = {
  recipe?: RecipeData;
  recipeJSON?: string;
  usage?: unknown;
  ocrText?: string;
  usedAIAssist?: boolean;
  deterministicStrong?: boolean;
};

const parseRecipeFromURLCallable = httpsCallable<
  ParseRecipeFromURLRequest,
  ParseRecipeFromUrlResponse
>(functions, "parseRecipeFromURL");

const parseRecipeFromImagesCallable = httpsCallable<
  ParseRecipeFromImagesRequest,
  ParseRecipeFromImagesCallableResponse
>(functions, "parseRecipeFromImages");

const parseSocialRecipeCallable = httpsCallable<
  ParseSocialRecipeRequest,
  ParseSocialRecipeResponse
>(functions, "parseSocialRecipe");

const editRecipeCallable = httpsCallable<
  {
    recipeId: string;
    recipe: RecipeData;
    userRequest: string;
    selectedIngredient?: {
      name: string;
      index: number;
      amount?: string;
      unit?: string;
    };
  },
  EditRecipeResponse
>(functions, "editRecipe");

const mergeAnonymousAccountCallable = httpsCallable<
  { anonymousUid: string; anonymousIdToken: string },
  { success: boolean }
>(functions, "mergeAnonymousAccount");

const checkUserProvidersCallable = httpsCallable<
  { email: string },
  { providers: string[] | null }
>(functions, "checkUserProviders");

const commitShareLinkCallable = httpsCallable<
  {
    shareId: string;
    recipeTitle: string;
    recipe: SharedRecipePayload;
    sourceURL?: string | null;
    imageURL?: string | null;
  },
  ShareLinkResult
>(functions, "commitShareLink");

const recordShareImportCallable = httpsCallable<
  { shareId: string },
  { success: boolean }
>(functions, "recordShareImport");

/** URL import — same callable iOS uses via `RecipeParserService`. */
export async function parseRecipeFromURL(
  url: string,
  options?: {
    importSessionID?: string;
    extraction?: ClientRecipeExtraction;
  },
): Promise<ParseRecipeFromUrlResponse> {
  const result = await parseRecipeFromURLCallable({
    url,
    ...(options?.importSessionID ? { importSessionID: options.importSessionID } : {}),
    ...(options?.extraction?.title ? { title: options.extraction.title } : {}),
    ...(options?.extraction?.caption ? { caption: options.extraction.caption } : {}),
    ...(options?.extraction?.description ? { description: options.extraction.description } : {}),
    ...(options?.extraction?.transcript ? { transcript: options.extraction.transcript } : {}),
    ...(options?.extraction?.imageURL ? { imageURL: options.extraction.imageURL } : {}),
  });
  return result.data;
}

export async function parseRecipeFromImages(
  images: string[],
): Promise<ParseRecipeFromImagesResponse> {
  const result = await parseRecipeFromImagesCallable({ images });
  return {
    recipe: recipeDataFromImageParseResponse(result.data),
    usage: result.data.usage,
    ocrText: result.data.ocrText,
    usedAIAssist: result.data.usedAIAssist,
    deterministicStrong: result.data.deterministicStrong,
  };
}

function recipeDataFromImageParseResponse(response: ParseRecipeFromImagesCallableResponse): RecipeData {
  const parsedRecipe = response.recipe ?? recipeDataFromJSON(response.recipeJSON);
  if (
    !parsedRecipe ||
    typeof parsedRecipe !== "object" ||
    !Array.isArray(parsedRecipe.ingredientSections) ||
    !Array.isArray(parsedRecipe.instructionSections)
  ) {
    throw new Error("Image parser returned an invalid recipe.");
  }
  return parsedRecipe;
}

function recipeDataFromJSON(recipeJSON: string | undefined): RecipeData | null {
  if (!recipeJSON) return null;
  try {
    return JSON.parse(recipeJSON) as RecipeData;
  } catch (error) {
    console.error("[ImageImport] Failed to parse recipeJSON", error);
    throw new Error("Image parser returned malformed recipe JSON.");
  }
}

/**
 * Caption/transcript import when the client already has text (not just OG metadata).
 * Same callable as iOS `SocialRecipeNormalizationService`.
 */
export async function parseSocialRecipe(
  request: ParseSocialRecipeRequest,
): Promise<ParseSocialRecipeResponse> {
  const result = await parseSocialRecipeCallable(request);
  return result.data;
}

export async function editRecipe(params: {
  recipeId: string;
  recipe: RecipeData;
  userRequest: string;
  selectedIngredient?: {
    ingredient: Ingredient;
    index: number;
  } | null;
}): Promise<EditRecipeResponse> {
  const selected = params.selectedIngredient;
  const result = await editRecipeCallable({
    recipeId: params.recipeId,
    recipe: params.recipe,
    userRequest: params.userRequest,
    ...(selected
      ? {
          selectedIngredient: {
            name: selected.ingredient.name,
            index: selected.index,
            ...(selected.ingredient.amount ? { amount: selected.ingredient.amount } : {}),
            ...(selected.ingredient.unit ? { unit: selected.ingredient.unit } : {}),
          },
        }
      : {}),
  });
  return result.data;
}

export async function mergeAnonymousAccount(
  anonymousUid: string,
  anonymousIdToken: string,
): Promise<void> {
  await mergeAnonymousAccountCallable({anonymousUid, anonymousIdToken});
}

export async function checkUserProviders(email: string): Promise<string[] | null> {
  const result = await checkUserProvidersCallable({ email });
  return result.data.providers;
}

/**
 * Persists a share doc using a client-reserved id after the user completes the
 * share action. Mirrors iOS `commitShareLink` — no Firestore write happens until
 * the share is actually committed, so abandoned shares leave no orphan docs.
 */
export async function commitShareLink(params: {
  shareId: string;
  recipeTitle: string;
  recipe: SharedRecipePayload;
  sourceURL?: string | null;
  imageURL?: string | null;
}): Promise<ShareLinkResult> {
  const result = await commitShareLinkCallable({
    shareId: params.shareId,
    recipeTitle: params.recipeTitle,
    recipe: params.recipe,
    ...(params.sourceURL ? { sourceURL: params.sourceURL } : {}),
    ...(params.imageURL ? { imageURL: params.imageURL } : {}),
  });
  return result.data;
}

/**
 * Records that the current user imported a shared recipe. Best-effort — a failure
 * here must never block the import itself.
 */
export async function recordShareImport(shareId: string): Promise<void> {
  if (!shareId.trim()) return;
  try {
    await recordShareImportCallable({ shareId });
  } catch (error) {
    console.error("[ShareLink] recordShareImport failed", error);
  }
}
