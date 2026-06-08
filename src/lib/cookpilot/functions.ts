import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/cloudFunctions";
import type { EditRecipeResponse, Ingredient, RecipeData, ShareLinkResult, SharedRecipePayload } from "@/lib/cookpilot/types";
import type { ClientRecipeExtraction } from "@/lib/cookpilot/clientExtraction";
import type { SocialPlatform } from "@/lib/cookpilot/socialPlatform";

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
    platform?: SocialPlatform;
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
  platform: SocialPlatform;
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

const parseRecipeFromURLCallable = httpsCallable<
  ParseRecipeFromURLRequest,
  ParseRecipeFromUrlResponse
>(functions, "parseRecipeFromURL");

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
  { anonymousUid: string },
  { success: boolean }
>(functions, "mergeAnonymousAccount");

const checkUserProvidersCallable = httpsCallable<
  { email: string },
  { providers: string[] | null }
>(functions, "checkUserProviders");

const createShareLinkCallable = httpsCallable<
  {
    recipeTitle: string;
    recipe: SharedRecipePayload;
    sourceURL?: string | null;
    imageURL?: string | null;
  },
  ShareLinkResult
>(functions, "createShareLink");

const deleteShareLinkCallable = httpsCallable<
  { shareId: string },
  { success: boolean }
>(functions, "deleteShareLink");

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

export async function mergeAnonymousAccount(anonymousUid: string): Promise<void> {
  await mergeAnonymousAccountCallable({ anonymousUid });
}

export async function checkUserProviders(email: string): Promise<string[] | null> {
  const result = await checkUserProvidersCallable({ email });
  return result.data.providers;
}

export async function createShareLink(params: {
  recipeTitle: string;
  recipe: SharedRecipePayload;
  sourceURL?: string | null;
  imageURL?: string | null;
}): Promise<ShareLinkResult> {
  const result = await createShareLinkCallable({
    recipeTitle: params.recipeTitle,
    recipe: params.recipe,
    ...(params.sourceURL ? { sourceURL: params.sourceURL } : {}),
    ...(params.imageURL ? { imageURL: params.imageURL } : {}),
  });
  return result.data;
}

export async function deleteShareLink(shareId: string): Promise<void> {
  if (!shareId.trim()) return;
  try {
    await deleteShareLinkCallable({ shareId });
  } catch (error) {
    console.error("[ShareLink] deleteShareLink failed", error);
  }
}
