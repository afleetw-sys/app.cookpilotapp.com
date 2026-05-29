import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth } from "@/lib/firebase/client";
import { storage } from "@/lib/firebase/cloudStorage";
import { proxiedExternalCoverUrl } from "@/lib/cookpilot/resolveRecipeCoverUrl";

const UPLOAD_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function recipeImageStoragePath(userId: string, recipeId: string, ext: string): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `recipe-images/${userId}/${recipeId}/image.${safeExt}`;
}

/** Server proxy for migration uploads (display uses direct <img> first in useResolvedRecipeCoverSrc). */
export async function fetchExternalRecipeImageBlob(externalUrl: string): Promise<Blob | null> {
  const proxyResponse = await fetch(proxiedExternalCoverUrl(externalUrl));
  if (proxyResponse.ok) {
    return proxyResponse.blob();
  }

  try {
    const directResponse = await fetch(externalUrl, { mode: "cors", credentials: "omit" });
    if (directResponse.ok) {
      return directResponse.blob();
    }
  } catch {
    // Display may still work via <img> without CORS; migration is best-effort.
  }

  return null;
}

/**
 * Fetches an external image via the server-side proxy and uploads it to
 * Firebase Storage, returning a permanent download URL.
 *
 * This mirrors iOS's ImageStorageService disk-caching strategy: iOS caches
 * every scraped image locally on first download so expiring CDN links (e.g.
 * TikTok, Instagram signed URLs) never cause broken images on future views.
 * On web we use Firebase Storage as the permanent store instead of a local
 * cache file.
 *
 * Returns null if the image cannot be fetched or uploaded (e.g. the CDN URL
 * has already expired).
 */
export async function migrateExternalImageToFirebaseStorage(
  userId: string,
  recipeId: string,
  externalUrl: string,
): Promise<string | null> {
  try {
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== userId) return null;

    const blob = await fetchExternalRecipeImageBlob(externalUrl);
    if (!blob) return null;
    const contentType = blob.type || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("gif")
        ? "gif"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";

    const fullPath = recipeImageStoragePath(userId, recipeId, ext);
    const storageRef = ref(storage, fullPath);
    const snapshot = await withTimeout(
      uploadBytes(storageRef, blob),
      UPLOAD_TIMEOUT_MS,
      "MigrateUpload",
    );
    return withTimeout(getDownloadURL(snapshot.ref), UPLOAD_TIMEOUT_MS, "MigrateGetURL");
  } catch {
    return null;
  }
}

export function isFirebaseStorageURL(url: string): boolean {
  return url.includes("firebasestorage.googleapis.com");
}

function extractStoragePath(imageURL: string): string | null {
  try {
    const url = new URL(imageURL);
    const oIndex = url.pathname.indexOf("/o/");
    if (oIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(oIndex + 3));
  } catch {
    return null;
  }
}

/**
 * Deletes a recipe image from Firebase Storage given its download URL.
 * Best-effort: errors are swallowed so a missing or inaccessible file never
 * blocks recipe deletion. Mirrors iOS ImageStorageService.deleteImageFromFirebase.
 */
export async function deleteRecipeImageFromFirebaseStorage(imageURL: string): Promise<void> {
  const path = extractStoragePath(imageURL);
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Non-fatal: file may already be gone or the path may be inaccessible
  }
}

export async function uploadRecipeImage(
  userId: string,
  recipeId: string,
  file: File,
): Promise<string> {
  await auth.authStateReady();
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    throw new Error("Not authenticated for image upload");
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const normalizedExt = ext === "jpeg" ? "jpg" : ext;

  const fullPath = recipeImageStoragePath(userId, recipeId, normalizedExt);
  const storageRef = ref(storage, fullPath);

  const snapshot = await withTimeout(uploadBytes(storageRef, file), UPLOAD_TIMEOUT_MS, "Upload");
  return withTimeout(getDownloadURL(snapshot.ref), UPLOAD_TIMEOUT_MS, "GetDownloadURL");
}
