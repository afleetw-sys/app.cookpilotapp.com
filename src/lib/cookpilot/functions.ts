import { httpsCallable } from "firebase/functions";
import { getToken } from "firebase/app-check";
import { functions } from "@/lib/firebase/cloudFunctions";
import { app, auth } from "@/lib/firebase/client";
import { appCheck } from "@/lib/firebase/appCheck";
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

type OperationalEventKind = "editor_edit" | "editor_undo" | "url_import" | "image_import" | "social_import";
type OperationalOutcome = "applied" | "partial_success" | "rejected" | "refused" | "failed" | "reverted";

export type OperationalEventRequest = {
  kind: OperationalEventKind;
  outcome: OperationalOutcome;
  source?: string | null;
  primaryAction?: string | null;
  operationTypes?: string[];
  editorVersion?: string | null;
  appVersion?: string | null;
  appPlatform?: string | null;
  recipeId?: string | null;
  versionId?: string | null;
  durationMs?: number | null;
  confidence?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  importURL?: string | null;
  storageReference?: string | null;
  platform?: string | null;
  failureStep?: string | null;
  errorCode?: string | null;
  createDebugInboxItem?: boolean;
};

const recordOperationalEventCallable = httpsCallable<
  OperationalEventRequest,
  { success: boolean; dateKey: string; debugId?: string | null }
>(functions, "recordOperationalEvent");

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

const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";

/**
 * Same request as commitShareLink, sent with fetch's `keepalive: true` instead of
 * going through the callable SDK. When navigator.share() hands off to another app
 * (e.g. Messages), mobile browsers can suspend the tab mid-continuation, silently
 * dropping a plain callable request before it reaches the server. keepalive lets
 * the browser finish sending the request even if the page is torn down right after.
 */
export async function commitShareLinkAfterNativeShare(params: {
  shareId: string;
  recipeTitle: string;
  recipe: SharedRecipePayload;
  sourceURL?: string | null;
  imageURL?: string | null;
}): Promise<void> {
  const projectId = app.options.projectId;
  const url = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/commitShareLink`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  if (appCheck) {
    try {
      headers["X-Firebase-AppCheck"] = (await getToken(appCheck, false)).token;
    } catch (error) {
      console.error("[ShareLink] Failed to attach App Check token", error);
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    keepalive: true,
    body: JSON.stringify({
      data: {
        shareId: params.shareId,
        recipeTitle: params.recipeTitle,
        recipe: params.recipe,
        ...(params.sourceURL ? { sourceURL: params.sourceURL } : {}),
        ...(params.imageURL ? { imageURL: params.imageURL } : {}),
      },
    }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error?.message || `commitShareLink failed (${response.status})`);
  }
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

export async function recordOperationalEvent(event: OperationalEventRequest): Promise<void> {
  await recordOperationalEventCallable(event);
}
