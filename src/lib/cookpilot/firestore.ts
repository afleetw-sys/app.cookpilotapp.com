import {
  Timestamp,
  deleteDoc,
  deleteField,
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  writeBatch,
  arrayUnion,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/db";
import type {
  RecipeData,
  RecipeDetailDocument,
  RecipePage,
  RecipePageCursor,
  RecipeSummary,
  RecipeThemeSeedColors,
  SavedRecipe,
} from "@/lib/cookpilot/types";
import { totalTimeMinutes } from "@/lib/cookpilot/timeFormatting";
import {
  clearStoredAttribution,
  getStoredAttribution,
} from "@/lib/cookpilot/attribution";

const COLLECTIONS = {
  users: "users",
  recipes: "recipes",
  detail: "detail",
  versions: "versions",
};

const DOCUMENTS = {
  recipeDetailMain: "main",
};

const LAST_ACTIVE_GATE_MS = 24 * 60 * 60 * 1000;

function asDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function recipesCollection(userId: string) {
  return collection(db, COLLECTIONS.users, userId, COLLECTIONS.recipes);
}

function recipeRef(userId: string, recipeId: string) {
  return doc(db, COLLECTIONS.users, userId, COLLECTIONS.recipes, recipeId);
}

function recipeDetailRef(userId: string, recipeId: string) {
  return doc(
    db,
    COLLECTIONS.users,
    userId,
    COLLECTIONS.recipes,
    recipeId,
    COLLECTIONS.detail,
    DOCUMENTS.recipeDetailMain,
  );
}

function recipeVersionsCollection(userId: string, recipeId: string) {
  return collection(
    db,
    COLLECTIONS.users,
    userId,
    COLLECTIONS.recipes,
    recipeId,
    COLLECTIONS.versions,
  );
}

function storedAttributionForFirestore(): Record<string, string | null> | null {
  const attribution = getStoredAttribution();
  if (
    !attribution ||
    (!attribution.utm_source && !attribution.utm_medium && !attribution.utm_campaign)
  ) {
    return null;
  }

  return {
    utmSource: attribution.utm_source,
    utmMedium: attribution.utm_medium,
    utmCampaign: attribution.utm_campaign,
    firstTouchAt: attribution.first_touch_at,
  };
}

export function decodeRecipeSummary(snapshot: QueryDocumentSnapshot<DocumentData>): RecipeSummary {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    title: data.title ?? null,
    imageURL: data.imageURL ?? data.imageUrl ?? null,
    localImagePath: data.localImagePath ?? null,
    sourceURL: data.sourceURL ?? null,
    createdAt: asDate(data.createdAt),
    preferredServings: data.preferredServings ?? null,
    servings: data.servings ?? null,
    ingredientNames: Array.isArray(data.ingredientNames) ? data.ingredientNames : [],
    totalTimeMinutes: data.totalTimeMinutes ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    systemTags: Array.isArray(data.systemTags) ? data.systemTags : [],
    themeSeedColors:
      data.themeSeedColors &&
      typeof data.themeSeedColors.primaryH === "number" &&
      typeof data.themeSeedColors.primaryS === "number" &&
      typeof data.themeSeedColors.primaryB === "number" &&
      typeof data.themeSeedColors.secondaryH === "number" &&
      typeof data.themeSeedColors.secondaryS === "number" &&
      typeof data.themeSeedColors.secondaryB === "number"
        ? {
            primaryH: data.themeSeedColors.primaryH,
            primaryS: data.themeSeedColors.primaryS,
            primaryB: data.themeSeedColors.primaryB,
            secondaryH: data.themeSeedColors.secondaryH,
            secondaryS: data.themeSeedColors.secondaryS,
            secondaryB: data.themeSeedColors.secondaryB,
          }
        : null,
  };
}

export function ingredientNamesForSearch(recipe: RecipeData): string[] {
  return recipe.ingredientSections.flatMap((section) =>
    section.ingredients.map((ingredient) => {
      const trimmedName = ingredient.name.trim();
      if (ingredient.notes?.trim()) return trimmedName;

      const commaIndex = trimmedName.indexOf(",");
      if (commaIndex > 0) return trimmedName.slice(0, commaIndex).trim();

      return trimmedName;
    }),
  );
}


function summaryDataForFirestore(recipe: SavedRecipe) {
  return {
    // iOS decodes RecipeSummary via Firestore.Encoder which writes `id` into the
    // document body (no @DocumentID annotation). Without this field, snapshot.data(as:)
    // throws and the recipe is silently skipped on every iOS load.
    id: recipe.id,
    title: recipe.recipe.title ?? null,
    imageURL: recipe.recipe.imageURL ?? null,
    localImagePath: recipe.recipe.localImagePath ?? null,
    sourceURL: recipe.sourceURL ?? null,
    createdAt: recipe.createdAt,
    preferredServings: recipe.preferredServings ?? null,
    servings: recipe.recipe.servings ?? null,
    ingredientNames: recipe.ingredientNames,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    tags: recipe.recipe.tags ?? [],
    systemTags: recipe.recipe.systemTags ?? [],
    ...(recipe.themeSeedColors ? { themeSeedColors: recipe.themeSeedColors } : {}),
  };
}

function detailDataForFirestore(recipe: SavedRecipe): RecipeDetailDocument {
  const detail: RecipeDetailDocument = {
    schemaVersion: recipe.recipe.schemaVersion ?? 2,
    description: recipe.recipe.description ?? null,
    prepTime: recipe.recipe.prepTime ?? null,
    cookTime: recipe.recipe.cookTime ?? null,
    ingredientSections: recipe.recipe.ingredientSections,
    instructionSections: recipe.recipe.instructionSections,
    checkedIngredientIndices: recipe.checkedIngredientIndices ?? [],
    preferredIngredientMeasurementRaw: recipe.preferredIngredientMeasurementRaw ?? null,
    storageSchemaVersion: 2,
  };

  if (recipe.recipe.nutrition !== undefined) {
    detail.nutrition = recipe.recipe.nutrition;
  }

  return detail;
}

export async function createUserDocument(params: {
  userId: string;
  email: string | null;
  displayName: string | null;
  provider: string;
  isAnonymous: boolean;
}) {
  const userRef = doc(db, COLLECTIONS.users, params.userId);
  const storedAttribution = storedAttributionForFirestore();

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(userRef);
    const data = existing.data() ?? {};
    const update: Record<string, unknown> = {
      providers: arrayUnion(params.provider),
      platformsUsed: arrayUnion("web"),
    };

    if (params.email) {
      update.email = params.email;
    } else if (!existing.exists()) {
      update.email = "";
    }

    if (params.displayName) {
      update.displayName = params.displayName;
    } else if (!existing.exists()) {
      update.displayName = "";
    }

    if (!existing.exists()) {
      update.createdAt = serverTimestamp();
    }

    // Attach first-touch marketing attribution the first time it is available
    // and not already recorded. Writing only when `data.attribution` is unset
    // preserves first-touch semantics (never overwritten) and survives the
    // anonymous-account merge, so attribution captured on the anonymous landing
    // session carries through to the real account it is claimed by.
    if (!data.attribution) {
      if (storedAttribution) {
        update.attribution = storedAttribution;
      }
    }

    if (params.isAnonymous) {
      if (!data.anonSignedInAt) {
        update.anonSignedInAt = serverTimestamp();
      }
    } else {
      update.anonSignedInAt = deleteField();
    }

    transaction.set(userRef, update, { merge: true });
  });

  if (storedAttribution) {
    clearStoredAttribution();
  }
}

export async function persistStoredAttributionToUserDocument(userId: string): Promise<void> {
  if (!userId.trim()) return;

  const attribution = storedAttributionForFirestore();
  if (!attribution) return;

  const userRef = doc(db, COLLECTIONS.users, userId);
  const existing = await getDoc(userRef);
  if (!existing.exists()) return;

  if (!existing.data()?.attribution) {
    await setDoc(userRef, { attribution }, { merge: true });
  }

  clearStoredAttribution();
}

export async function updateUserSessionMetadataIfNeeded(userId: string): Promise<void> {
  if (!userId.trim() || typeof window === "undefined") return;

  const storageKey = `cookpilot.lastActiveUpdate.${userId}`;
  const lastUpdate = Number(window.localStorage.getItem(storageKey));
  const now = Date.now();
  if (Number.isFinite(lastUpdate) && now - lastUpdate < LAST_ACTIVE_GATE_MS) {
    return;
  }

  await setDoc(
    doc(db, COLLECTIONS.users, userId),
    { lastActive: serverTimestamp() },
    { merge: true },
  );
  window.localStorage.setItem(storageKey, String(now));
}

export async function checkUserByEmail(email: string): Promise<string[] | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.users),
      where("email", "==", normalizedEmail),
      limit(1),
    ),
  );

  const document = snapshot.docs[0];
  if (!document) {
    return null;
  }

  const providers = document.data().providers;
  return Array.isArray(providers) ? providers.filter((value): value is string => typeof value === "string") : [];
}

export async function loadRecipePage(
  userId: string,
  cursor: RecipePageCursor | null,
  pageSize = 24,
  includeTotalCount = false,
): Promise<RecipePage> {
  const baseRef = recipesCollection(userId);
  const baseQuery = query(
    baseRef,
    orderBy("createdAt", "desc"),
    orderBy(documentId(), "desc"),
    limit(pageSize + 1),
  );
  const pageQuery = cursor
    ? query(baseQuery, startAfter(Timestamp.fromDate(cursor.createdAt), cursor.id))
    : baseQuery;

  const [snapshot, countSnapshot] = await Promise.all([
    getDocs(pageQuery),
    includeTotalCount ? getCountFromServer(baseRef) : Promise.resolve(null),
  ]);
  const docs = snapshot.docs;
  const recipes = docs.slice(0, pageSize).map(decodeRecipeSummary);
  const lastDoc = docs.length > pageSize ? docs[pageSize - 1] : null;
  const nextCursor = lastDoc
    ? { createdAt: asDate(lastDoc.data().createdAt), id: lastDoc.id }
    : null;

  return { recipes, nextCursor, totalCount: countSnapshot?.data().count ?? null };
}

export async function loadAllRecipeTags(userId: string): Promise<string[]> {
  const snapshot = await getDocs(recipesCollection(userId));
  const tags = new Set<string>();

  snapshot.docs.forEach((recipeSnapshot) => {
    const data = recipeSnapshot.data();
    const recipeTags = Array.isArray(data.tags) ? data.tags : [];
    const systemTags = Array.isArray(data.systemTags) ? data.systemTags : [];

    [...recipeTags, ...systemTags].forEach((tag) => {
      if (typeof tag !== "string") return;
      const trimmed = tag.trim();
      if (trimmed.length > 0) {
        tags.add(trimmed);
      }
    });
  });

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function assembleSavedRecipe(
  recipeId: string,
  summarySnap: QueryDocumentSnapshot<DocumentData>,
  detail: RecipeDetailDocument | undefined,
): SavedRecipe {
  const summary = decodeRecipeSummary(summarySnap);
  const recipe: RecipeData = {
    schemaVersion: detail?.schemaVersion ?? 2,
    title: summary.title,
    description: detail?.description ?? null,
    servings: summary.preferredServings ?? summary.servings ?? null,
    prepTime: detail?.prepTime ?? null,
    cookTime: detail?.cookTime ?? null,
    ingredientSections: detail?.ingredientSections ?? [],
    instructionSections: detail?.instructionSections ?? [],
    imageURL: summary.imageURL ?? null,
    localImagePath: summary.localImagePath ?? null,
    tags: summary.tags,
    systemTags: summary.systemTags,
    nutrition: detail?.nutrition,
  };

  return {
    id: recipeId,
    recipe,
    sourceURL: summary.sourceURL ?? null,
    createdAt: summary.createdAt,
    preferredServings: summary.preferredServings ?? null,
    checkedIngredientIndices: Array.isArray(detail?.checkedIngredientIndices)
      ? detail.checkedIngredientIndices.filter((value): value is number => Number.isInteger(value))
      : [],
    preferredIngredientMeasurementRaw: detail?.preferredIngredientMeasurementRaw ?? null,
    ingredientNames: summary.ingredientNames,
    totalTimeMinutes: summary.totalTimeMinutes ?? null,
    themeSeedColors: summary.themeSeedColors ?? null,
  };
}

export async function loadRecipe(userId: string, recipeId: string): Promise<SavedRecipe | null> {
  const [summarySnapshot, detailSnapshot] = await Promise.all([
    getDoc(recipeRef(userId, recipeId)),
    getDoc(recipeDetailRef(userId, recipeId)),
  ]);
  if (!summarySnapshot.exists()) return null;

  return assembleSavedRecipe(
    recipeId,
    summarySnapshot,
    detailSnapshot.data() as RecipeDetailDocument | undefined,
  );
}

export async function loadRecipeWithSummaryDoc(
  userId: string,
  recipeId: string,
  summarySnap: QueryDocumentSnapshot<DocumentData>,
): Promise<SavedRecipe> {
  const detailSnapshot = await getDoc(recipeDetailRef(userId, recipeId));
  return assembleSavedRecipe(
    recipeId,
    summarySnap,
    detailSnapshot.data() as RecipeDetailDocument | undefined,
  );
}

export async function saveRecipe(userId: string, recipe: SavedRecipe): Promise<void> {
  const ingredientCount = recipe.recipe.ingredientSections.reduce(
    (count, section) => count + section.ingredients.length,
    0,
  );
  const instructionCount = recipe.recipe.instructionSections.reduce(
    (count, section) => count + section.instructions.length,
    0,
  );
  console.info(
    `[Firestore] saveRecipe recipeId=${recipe.id} schemaVersion=${recipe.recipe.schemaVersion ?? 2} ingredientCount=${ingredientCount} instructionCount=${instructionCount}`,
  );
  try {
    const batch = writeBatch(db);
    batch.set(recipeRef(userId, recipe.id), summaryDataForFirestore(recipe), { merge: true });
    batch.set(recipeDetailRef(userId, recipe.id), detailDataForFirestore(recipe), { merge: true });
    await batch.commit();
  } catch (error) {
    console.error(
      `[Firestore] saveRecipe failed recipeId=${recipe.id} error=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export async function updateRecipeDetailPreferences(params: {
  userId: string;
  recipeId: string;
  checkedIngredientIndices?: number[];
  preferredIngredientMeasurementRaw?: string | null;
}): Promise<void> {
  await setDoc(
    recipeDetailRef(params.userId, params.recipeId),
    {
      ...(params.checkedIngredientIndices !== undefined
        ? { checkedIngredientIndices: params.checkedIngredientIndices }
        : {}),
      ...(params.preferredIngredientMeasurementRaw !== undefined
        ? { preferredIngredientMeasurementRaw: params.preferredIngredientMeasurementRaw }
        : {}),
      storageSchemaVersion: 2,
    },
    { merge: true },
  );
}

export async function deleteRecipe(userId: string, recipeId: string): Promise<void> {
  const versionsSnapshot = await getDocs(recipeVersionsCollection(userId, recipeId));

  const refsToDelete = [
    ...versionsSnapshot.docs.map((d) => d.ref),
    recipeDetailRef(userId, recipeId),
    recipeRef(userId, recipeId),
  ];

  for (let index = 0; index < refsToDelete.length; index += 400) {
    const batch = writeBatch(db);
    for (const ref of refsToDelete.slice(index, index + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function deleteAllUserData(userId: string): Promise<void> {
  const recipesSnapshot = await getDocs(recipesCollection(userId));

  await Promise.all(
    recipesSnapshot.docs.map(async (recipeSnapshot) => {
      const recipeId = recipeSnapshot.id;
      const versionsSnapshot = await getDocs(recipeVersionsCollection(userId, recipeId));

      const refsToDelete = [
        ...versionsSnapshot.docs.map((d) => d.ref),
        recipeDetailRef(userId, recipeId),
        recipeRef(userId, recipeId),
      ];

      for (let index = 0; index < refsToDelete.length; index += 400) {
        const batch = writeBatch(db);
        for (const ref of refsToDelete.slice(index, index + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }
    }),
  );

  await deleteDoc(doc(db, COLLECTIONS.users, userId));
}

export function buildSavedRecipe(params: {
  id: string;
  recipe: RecipeData;
  sourceURL?: string | null;
  createdAt?: Date;
  preferredServings?: number | null;
  checkedIngredientIndices?: number[];
  preferredIngredientMeasurementRaw?: string | null;
  themeSeedColors?: RecipeThemeSeedColors | null;
}): SavedRecipe {
  return {
    id: params.id,
    recipe: params.recipe,
    sourceURL: params.sourceURL ?? null,
    createdAt: params.createdAt ?? new Date(),
    preferredServings: params.preferredServings ?? null,
    checkedIngredientIndices: params.checkedIngredientIndices ?? [],
    preferredIngredientMeasurementRaw: params.preferredIngredientMeasurementRaw ?? null,
    ingredientNames: ingredientNamesForSearch(params.recipe),
    totalTimeMinutes: totalTimeMinutes(params.recipe.prepTime, params.recipe.cookTime),
    themeSeedColors: params.themeSeedColors ?? null,
  };
}

export async function updateThemeSeedColors(
  userId: string,
  recipeId: string,
  themeSeedColors: RecipeThemeSeedColors,
): Promise<void> {
  await setDoc(recipeRef(userId, recipeId), { themeSeedColors }, { merge: true });
}

/**
 * Patches only the imageURL field on the recipe summary document.
 * Used after migrating an external image to Firebase Storage so future loads
 * use the stable Firebase URL instead of the (possibly expiring) external CDN link.
 */
export async function updateRecipeImageURL(
  userId: string,
  recipeId: string,
  imageURL: string,
): Promise<void> {
  await setDoc(recipeRef(userId, recipeId), { imageURL }, { merge: true });
}
