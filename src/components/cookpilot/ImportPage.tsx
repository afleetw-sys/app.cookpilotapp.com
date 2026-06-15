"use client";

import { ArrowClockwise, ArrowLeft, ImageSquare, LinkSimple, PencilSimple, TrayArrowDown, UploadSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { StateBlock } from "@/components/ui/StateBlock";
import { TextField } from "@/components/ui/TextField";
import { extractThemeSeedColors } from "@/lib/cookpilot/extractTheme";
import { isFirebaseStorageURL, migrateExternalImageToFirebaseStorage, uploadRecipeImage } from "@/lib/cookpilot/imageStorage";
import { IMPORT_DRAFT_SEARCH_PARAM, savePendingImportDraft } from "@/lib/cookpilot/importDraft";
import { importRecipeFromURL } from "@/lib/cookpilot/importRecipe";
import { proxiedExternalCoverUrl } from "@/lib/cookpilot/resolveRecipeCoverUrl";
import { parseRecipeFromImages } from "@/lib/cookpilot/functions";
import { SocialImportTrace } from "@/lib/cookpilot/socialImportTrace";
import { detectSocialPlatform } from "@/lib/cookpilot/socialPlatform";
import { parseCookPilotShareId, resolveSharedRecipeImport, importLegacySharedRecipe } from "@/lib/cookpilot/sharedRecipe";
import type { RecipeThemeSeedColors } from "@/lib/cookpilot/types";

type ImportMode = "url" | "image";
const THEME_EXTRACTION_TIMEOUT_MS = 4_500;

function readImageAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function selectedImageLabel(files: File[]): string {
  if (files.length === 0) return "Choose or drop images";
  if (files.length === 1) return files[0].name;
  return `${files.length} images selected`;
}

function imageFilesFromList(files: FileList | null): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

function imageUrlForThemeExtraction(imageURL: string | null | undefined): string | null {
  const trimmed = imageURL?.trim();
  if (!trimmed?.startsWith("http")) return null;
  return isFirebaseStorageURL(trimmed) ? trimmed : proxiedExternalCoverUrl(trimmed);
}

async function extractThemeSeedColorsForImport(
  imageURL: string | null | undefined,
): Promise<RecipeThemeSeedColors | null> {
  const extractionURL = imageUrlForThemeExtraction(imageURL);
  if (!extractionURL) return null;
  return extractThemeSeedColorsWithTimeout(extractionURL);
}

async function extractThemeSeedColorsWithTimeout(
  imageURL: string,
): Promise<RecipeThemeSeedColors | null> {
  return Promise.race([
    extractThemeSeedColors(imageURL),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), THEME_EXTRACTION_TIMEOUT_MS);
    }),
  ]);
}

export function ImportRecipePanel({
  onComplete,
  framed = true,
}: {
  onComplete?: (recipeId: string) => void;
  framed?: boolean;
}) {
  const router = useRouter();
  const { ensureAnonymousUser, user } = useAuth();
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDraft(recipeId: string) {
    if (onComplete) {
      onComplete(recipeId);
    } else {
      router.push(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
    }
  }

  async function handleImportRecipe() {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    let fallbackDraftURL: string | null = null;

    try {
      const activeUser = user ?? await ensureAnonymousUser();
      const userId = activeUser.uid;
      const trimmedURL = url.trim();
      const shareId = parseCookPilotShareId(trimmedURL);
      if (shareId) {
        const resolved = await resolveSharedRecipeImport(shareId);
        if (!resolved) {
          throw new Error("Shared recipe not found");
        }

        if (resolved.kind === "snapshot") {
          openDraft(resolved.recipeId);
          return;
        }

        const recipeId = await importLegacySharedRecipe(resolved.sourceURL);
        openDraft(recipeId);
        return;
      }

      fallbackDraftURL = trimmedURL;
      const imported = await importRecipeFromURL(trimmedURL);
      const recipeId = crypto.randomUUID();

      // Mirror social CDN thumbnails (Instagram, TikTok, Pinterest) to Firebase Storage
      // before storing the draft so the pending recipe already holds a permanent URL.
      // Regular recipe site thumbnails are stable links and are stored as-is.
      let recipeData = imported.recipe;
      const originalParsedImageURL = recipeData.imageURL;
      const isSocialURL = detectSocialPlatform(trimmedURL) !== null;
      if (isSocialURL && recipeData.imageURL && !isFirebaseStorageURL(recipeData.imageURL)) {
        const mirrored = await migrateExternalImageToFirebaseStorage(userId, recipeId, recipeData.imageURL);
        if (mirrored) {
          recipeData = { ...recipeData, imageURL: mirrored };
        }
      }

      const themeSeedColors =
        await extractThemeSeedColorsForImport(recipeData.imageURL) ??
        await extractThemeSeedColorsForImport(originalParsedImageURL);

      if (SocialImportTrace.lastCompletedImportSessionIDValue) {
        console.info(
          `[SocialImport] importSessionLinkedToRecipe importSessionID=${SocialImportTrace.lastCompletedImportSessionIDValue} recipeId=${recipeId} finalParserSource=${imported.finalParserSource}`,
        );
      }

      // Store the parsed recipe as a pending draft. The detail page will open in edit
      // mode so the user can review before the first Firestore write happens.
      savePendingImportDraft(recipeId, recipeData, trimmedURL, themeSeedColors);

      openDraft(recipeId);
    } catch (nextError) {
      console.error(nextError);
      if (fallbackDraftURL) {
        const recipeId = crypto.randomUUID();
        savePendingImportDraft(
          recipeId,
          { ingredientSections: [], instructionSections: [], servings: 1 },
          fallbackDraftURL,
        );
        openDraft(recipeId);
        return;
      }
      setError("We couldn't import a recipe from that URL.");
      setLoading(false);
    }
  }

  async function handleImportImage() {
    if (imageFiles.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const activeUser = user ?? await ensureAnonymousUser();
      const recipeId = crypto.randomUUID();
      const imageDataURLs = await Promise.all(imageFiles.map(readImageAsDataURL));
      const parsedImageRecipe = await parseRecipeFromImages(imageDataURLs);
      let recipeData = parsedImageRecipe.recipe;

      const uploadedImageURL = await uploadRecipeImage(activeUser.uid, recipeId, imageFiles[0]);
      recipeData = { ...recipeData, imageURL: uploadedImageURL };
      const themeSeedColors = await extractThemeSeedColorsWithTimeout(imageDataURLs[0]);

      savePendingImportDraft(recipeId, recipeData, "photo_upload", themeSeedColors);
      openDraft(recipeId);
    } catch (nextError) {
      console.error(nextError);
      setError("We couldn't import a recipe from that image.");
      setLoading(false);
    }
  }

  function handleImageDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!loading) {
      event.dataTransfer.dropEffect = "copy";
      setIsDraggingImages(true);
    }
  }

  function handleImageDragLeave(event: DragEvent<HTMLLabelElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDraggingImages(false);
  }

  function handleImageDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingImages(false);
    if (loading) return;

    const droppedImages = imageFilesFromList(event.dataTransfer.files);
    if (droppedImages.length === 0) return;

    setImageFiles(droppedImages);
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (importMode === "url") {
      void handleImportRecipe();
    } else {
      void handleImportImage();
    }
  }

  async function handleCreateBlank() {
    await ensureAnonymousUser();
    const recipeId = crypto.randomUUID();
    savePendingImportDraft(recipeId, { ingredientSections: [], instructionSections: [], servings: 1 }, null);
    openDraft(recipeId);
  }

  const content = (
    <>
      <div aria-label="Import source" className="cp-import-mode-toggle" role="tablist">
        {(["url", "image"] as const).map((mode) => (
          <button
            aria-selected={importMode === mode}
            className={`cp-import-mode-toggle__item ${importMode === mode ? "is-active" : ""}`.trim()}
            disabled={loading}
            key={mode}
            onClick={() => {
              setImportMode(mode);
              setError(null);
            }}
            role="tab"
            type="button"
          >
            {mode === "url" ? <LinkSimple size={18} /> : <ImageSquare size={18} />}
            <span>{mode === "url" ? "URL" : "Image"}</span>
          </button>
        ))}
      </div>

      <form className="cp-import-form" onSubmit={handleSubmit}>
        {importMode === "url" ? (
          <>
            <TextField
              autoFocus
              data-autofocus="true"
              label="Recipe URL"
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
              placeholder="https://example.com/recipe"
              type="url"
              value={url}
            />
            <Button disabled={loading || !url.trim()} type="submit">
              {loading ? (
                <ArrowClockwise className="cp-spin" size={18} />
              ) : (
                <TrayArrowDown size={18} />
              )}
              Import recipe
            </Button>
          </>
        ) : (
          <>
            <label
              className={`cp-image-import ${isDraggingImages ? "is-dragging" : ""}`.trim()}
              onDragLeave={handleImageDragLeave}
              onDragOver={handleImageDragOver}
              onDrop={handleImageDrop}
            >
              <input
                accept="image/*"
                className="cp-image-import__input"
                disabled={loading}
                multiple
                onChange={(event) => {
                  setImageFiles(imageFilesFromList(event.target.files));
                  setError(null);
                }}
                type="file"
              />
              <span className="cp-image-import__button">
                <UploadSimple size={18} />
                <span>{selectedImageLabel(imageFiles)}</span>
              </span>
            </label>
            <Button disabled={loading || imageFiles.length === 0} type="submit">
              {loading ? (
                <ArrowClockwise className="cp-spin" size={18} />
              ) : (
                <TrayArrowDown size={18} />
              )}
              Import recipe
            </Button>
          </>
        )}
      </form>

      {error ? <StateBlock message={error} title="Import issue" tone="error" /> : null}
      <div className="cp-import-divider">
        <span>or</span>
      </div>
      <Button onClick={() => void handleCreateBlank()} variant="secondary">
        <PencilSimple size={18} />
        Write your own recipe
      </Button>
    </>
  );

  if (!framed) return content;

  return <section className="cp-settings-card cp-page-card">{content}</section>;
}

export function ImportPage() {
  const router = useRouter();

  return (
    <div className="cp-page-section">
      <div className="cp-section-header">
        <Button onClick={() => router.push("/recipes")} size="compact" variant="icon">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <p className="cp-eyebrow">Import</p>
          <h1>Import recipe from URL</h1>
        </div>
      </div>

      <ImportRecipePanel />
    </div>
  );
}
