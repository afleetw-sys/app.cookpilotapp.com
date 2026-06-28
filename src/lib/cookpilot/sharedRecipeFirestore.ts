import type { RecipeData, SharedRecipePayload } from "@/lib/cookpilot/types";

// Server-safe Firestore REST primitives for reading `sharedRecipes` docs.
//
// Intentionally free of any client-only dependencies (no `firebase` SDK,
// sessionStorage, or `window` access) so it can run inside `generateMetadata`
// on the server as well as in the browser import flow.

export const SHARED_RECIPES_COLLECTION = "sharedRecipes";
const SHARED_RECIPES_SLUGS_DOC = "_slugs";
const SHARED_RECIPES_SLUG_ITEMS_COLLECTION = "items";
export const SHARE_RECIPE_PAYLOAD_FIELD = "recipe";
export const SHARE_SOURCE_URL_FIELD = "sourceURL";
const SHARE_RECIPE_TITLE_FIELD = "recipeTitle";
const SHARE_IMAGE_URL_FIELD = "imageURL";
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

export async function fetchFirestoreDocument(pathSegments: string[]) {
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

export function decodeFirestoreDocument(document: FirestoreRestDocument | null) {
  if (!document?.fields) return null;
  return Object.fromEntries(
    Object.entries(document.fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  ) as Record<string, unknown>;
}

export async function resolveCanonicalShareId(shareKey: string): Promise<string | null> {
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

export type SharedRecipeOpenGraph = {
  title: string;
  description: string | null;
  imageURL: string | null;
};

/**
 * Server-safe read of a shared recipe's preview metadata (title + cover image)
 * for Open Graph / link-preview tags. Mirrors what iOS attaches to a shared
 * link so the recipe photo shows up in iMessage, etc. Returns null when the
 * share is missing or has no usable preview data.
 */
export async function fetchSharedRecipeOpenGraph(
  shareKey: string,
): Promise<SharedRecipeOpenGraph | null> {
  const shareId = await resolveCanonicalShareId(shareKey);
  if (!shareId) return null;

  const data = decodeFirestoreDocument(
    await fetchFirestoreDocument([SHARED_RECIPES_COLLECTION, shareId]),
  );
  if (!data) return null;

  const payload = data[SHARE_RECIPE_PAYLOAD_FIELD] as SharedRecipePayload | undefined;
  const recipe: RecipeData | undefined = payload?.recipe;

  const topLevelTitle = typeof data[SHARE_RECIPE_TITLE_FIELD] === "string"
    ? (data[SHARE_RECIPE_TITLE_FIELD] as string).trim()
    : "";
  const title = topLevelTitle || recipe?.title?.trim() || "Recipe";

  const topLevelImage = typeof data[SHARE_IMAGE_URL_FIELD] === "string"
    ? (data[SHARE_IMAGE_URL_FIELD] as string).trim()
    : "";
  const imageURL = topLevelImage || recipe?.imageURL?.trim() || null;

  const description = recipe?.description?.trim() || null;

  return { title, description, imageURL };
}
