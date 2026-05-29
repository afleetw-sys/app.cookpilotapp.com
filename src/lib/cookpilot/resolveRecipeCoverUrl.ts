import { getDownloadURL, ref } from "firebase/storage";
import { auth, authReady } from "@/lib/firebase/client";
import { storage } from "@/lib/firebase/cloudStorage";
import { logRecipeImageLoad } from "@/lib/cookpilot/recipeImageDiagnostics";

// Storage rules require App Check on this project (same as AuthProvider / uploads).
import "@/lib/firebase/appCheck";

/** Mirrors iOS ImageStorageService.isFirebaseStorageURL */
export function isFirebaseStorageURL(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("firebasestorage.googleapis.com") || lower.includes("firebasestorage.app");
}

/** Mirrors iOS ImageStorageService.extractStoragePath */
export function extractFirebaseStoragePath(imageURL: string): string | null {
  try {
    const url = new URL(imageURL);
    const match = url.pathname.match(/\/o\/(.+)$/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function downloadUrlForStoragePath(
  storagePath: string,
  recipeId: string,
): Promise<string | null> {
  try {
    await authReady;
    if (!auth.currentUser) {
      logRecipeImageLoad(recipeId, "firebaseRefresh.notAuthenticated");
      return null;
    }
    return await getDownloadURL(ref(storage, storagePath));
  } catch (error) {
    const code = (error as { code?: string }).code ?? "unknown";
    const message = error instanceof Error ? error.message : String(error);
    logRecipeImageLoad(recipeId, "firebaseRefresh.failed", { path: storagePath, code, message });
    return null;
  }
}

/**
 * Fresh signed download URL for a Firebase Storage object (Firestore tokens expire).
 * Matches iOS ImageStorageService.refreshFirebaseDownloadURL.
 */
export async function refreshRecipeCoverSrc(
  userId: string,
  recipeId: string,
  imageURL: string,
): Promise<string | null> {
  void userId;
  const trimmed = imageURL.trim();
  if (!isFirebaseStorageURL(trimmed)) return null;

  const storagePath = extractFirebaseStoragePath(trimmed);
  if (!storagePath) {
    logRecipeImageLoad(recipeId, "firebaseRefresh.invalidPath", { url: trimmed });
    return null;
  }

  return downloadUrlForStoragePath(storagePath, recipeId);
}

/**
 * Returns a URL suitable for `<img src>`. Firebase URLs are always refreshed via the SDK first.
 */
export async function resolveRecipeCoverSrc(
  userId: string,
  recipeId: string,
  imageURL: string,
): Promise<string | null> {
  void userId;
  const trimmed = imageURL.trim();
  if (!trimmed) return null;
  if (isFirebaseStorageURL(trimmed)) {
    return refreshRecipeCoverSrc(userId, recipeId, trimmed);
  }
  return trimmed;
}

export function proxiedExternalCoverUrl(url: string): string {
  return `/api/recipe-cover?url=${encodeURIComponent(url)}`;
}
