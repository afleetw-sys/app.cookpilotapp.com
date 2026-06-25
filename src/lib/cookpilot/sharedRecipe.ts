import { savePendingImportDraft } from "@/lib/cookpilot/importDraft";
import { importRecipeFromURL } from "@/lib/cookpilot/importRecipe";
import type { RecipeData, SharedRecipePayload } from "@/lib/cookpilot/types";

const SHARED_RECIPES_COLLECTION = "sharedRecipes";
const SHARED_RECIPES_SLUGS_DOC = "_slugs";
const SHARED_RECIPES_SLUG_ITEMS_COLLECTION = "items";
const SHARE_RECIPE_PAYLOAD_FIELD = "recipe";
const SHARE_SOURCE_URL_FIELD = "sourceURL";
const SHARE_SLUG_SHARE_ID_FIELD = "shareId";
const MAX_SHARE_KEY_LENGTH = 128;
const FIRESTORE_DATABASE = "(default)";
const COOKPILOT_SHARE_HOSTS = new Set([
  "app.cookpilotapp.com",
  "cookpilotapp.com",
  "www.cookpilotapp.com",
]);

type FirestoreRestDocument = {
  fields?: Record<string, FirestoreRestValue>;
};

type FirestoreRestValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
  arrayValue?: { values?: FirestoreRestValue[] };
};

export function parseCookPilotShareKey(rawURL: string): string | null {
  const trimmed = rawURL.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (!COOKPILOT_SHARE_HOSTS.has(host)) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if ((parts[0] === "r" || parts[0] === "shared") && parts[1]) {
      return decodeURIComponent(parts[1]);
    }
  } catch {
    return null;
  }

  return null;
}

export const parseCookPilotShareId = parseCookPilotShareKey;

/**
 * Generates a client-reserved share id. Matches iOS `ShareLinkService.newShareId`
 * and the Cloud Function's `newShareId` (16 hex chars), so a link can be shown
 * before the doc is committed. Random per call — two people sharing the same
 * recipe always get distinct ids.
 */
export function newShareId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function ingredientCount(recipe: RecipeData): number {
  return recipe.ingredientSections.reduce(
    (count, section) => count + section.ingredients.length,
    0,
  );
}

function instructionCount(recipe: RecipeData): number {
  return recipe.instructionSections.reduce(
    (count, section) => count + section.instructions.length,
    0,
  );
}

function isValidSharedRecipePayload(value: unknown): value is SharedRecipePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as SharedRecipePayload;
  if (!payload.recipe || typeof payload.recipe !== "object") return false;
  return ingredientCount(payload.recipe) > 0 && instructionCount(payload.recipe) > 0;
}

function firebaseProjectId() {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
}

function firebaseApiKey() {
  return process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
}

function firestoreDocumentUrl(pathSegments: string[]) {
  const projectId = firebaseProjectId();
  const apiKey = firebaseApiKey();
  if (!projectId || !apiKey) {
    throw new Error("Missing Firebase web configuration.");
  }

  const encodedPath = pathSegments.map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${FIRESTORE_DATABASE}/documents/${encodedPath}?key=${apiKey}`;
}

async function fetchFirestoreDocument(pathSegments: string[]) {
  const response = await fetch(firestoreDocumentUrl(pathSegments));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore REST read failed: ${response.status}`);
  }

  return (await response.json()) as FirestoreRestDocument;
}

function decodeFirestoreValue(value: FirestoreRestValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, fieldValue]) => [key, decodeFirestoreValue(fieldValue)]),
    );
  }
  return undefined;
}

function decodeFirestoreDocument(document: FirestoreRestDocument | null) {
  if (!document?.fields) return null;
  return Object.fromEntries(
    Object.entries(document.fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  ) as Record<string, unknown>;
}

export type SharedRecipeImportSnapshot = {
  kind: "snapshot";
  recipeId: string;
};

export type SharedRecipeImportLegacy = {
  kind: "legacy";
  sourceURL: string;
};

export type SharedRecipeImportResult =
  | SharedRecipeImportSnapshot
  | SharedRecipeImportLegacy;

async function resolveCanonicalShareId(shareKey: string): Promise<string | null> {
  const trimmed = shareKey.trim();
  if (!trimmed || trimmed.length > MAX_SHARE_KEY_LENGTH || trimmed.includes("/")) return null;

  const directShare = await fetchFirestoreDocument([SHARED_RECIPES_COLLECTION, trimmed]);
  if (directShare) return trimmed;

  const nestedSlug = decodeFirestoreDocument(
    await fetchFirestoreDocument([
      SHARED_RECIPES_COLLECTION,
      SHARED_RECIPES_SLUGS_DOC,
      SHARED_RECIPES_SLUG_ITEMS_COLLECTION,
      trimmed,
    ]),
  );
  if (!nestedSlug) return null;

  const shareId = nestedSlug[SHARE_SLUG_SHARE_ID_FIELD];
  if (typeof shareId !== "string" || !shareId.trim() || shareId.length > 64) return null;
  return shareId.trim();
}

export async function resolveSharedRecipeImport(
  shareKey: string,
): Promise<SharedRecipeImportResult | null> {
  const shareId = await resolveCanonicalShareId(shareKey);
  if (!shareId) return null;

  const data = decodeFirestoreDocument(
    await fetchFirestoreDocument([SHARED_RECIPES_COLLECTION, shareId]),
  );
  if (!data) return null;

  const recipePayload = data[SHARE_RECIPE_PAYLOAD_FIELD];
  if (isValidSharedRecipePayload(recipePayload)) {
    const recipeId = crypto.randomUUID();
    const recipeData: RecipeData = {
      ...recipePayload.recipe,
      localImagePath: null,
    };
    savePendingImportDraft(recipeId, recipeData, recipePayload.sourceURL ?? null, null, shareId);
    return { kind: "snapshot", recipeId };
  }

  const legacySourceURL = data[SHARE_SOURCE_URL_FIELD];
  if (typeof legacySourceURL === "string" && legacySourceURL.trim()) {
    return { kind: "legacy", sourceURL: legacySourceURL.trim() };
  }

  return null;
}

export async function importLegacySharedRecipe(sourceURL: string): Promise<string> {
  const imported = await importRecipeFromURL(sourceURL);
  const recipeId = crypto.randomUUID();
  savePendingImportDraft(recipeId, imported.recipe, sourceURL);
  return recipeId;
}

export function buildShareLinkPayload(recipe: RecipeData, sourceURL?: string | null) {
  const payload: SharedRecipePayload = {
    recipe: {
      ...recipe,
      localImagePath: null,
    },
    sourceURL: sourceURL ?? null,
  };

  if (ingredientCount(payload.recipe) === 0 || instructionCount(payload.recipe) === 0) {
    throw new Error("Recipe must include ingredients and steps before sharing.");
  }

  return payload;
}

export async function savedRecipeFromSharedPayload(payload: SharedRecipePayload) {
  const { buildSavedRecipe } = await import("@/lib/cookpilot/firestore");
  return buildSavedRecipe({
    id: crypto.randomUUID(),
    recipe: {
      ...payload.recipe,
      localImagePath: null,
    },
    sourceURL: payload.sourceURL ?? null,
  });
}
