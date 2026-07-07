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
import { parseRecipeFromImages, recordOperationalEvent } from "@/lib/cookpilot/functions";
import { SocialImportTrace } from "@/lib/cookpilot/socialImportTrace";
import { detectSocialPlatform } from "@/lib/cookpilot/socialPlatform";
import { parseCookPilotShareKey, resolveSharedRecipeImport, importLegacySharedRecipe } from "@/lib/cookpilot/sharedRecipe";
import type { RecipeData, RecipeThemeSeedColors } from "@/lib/cookpilot/types";

type ImportMode = "url" | "image";
const THEME_EXTRACTION_TIMEOUT_MS = 4_500;
const URL_IMPORT_FALLBACK_NOTICE =
  "We couldn't pull the recipe details from this link yet. We've logged it for review, and you can enter the recipe here while we look into it.";

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

function recipeIsBlank(recipe: RecipeData): boolean {
  const ingredientCount = recipe.ingredientSections.reduce(
    (count, section) => count + section.ingredients.filter((ingredient) => ingredient.name.trim()).length,
    0,
  );
  const instructionCount = recipe.instructionSections.reduce(
    (count, section) => count + section.instructions.filter((instruction) => instruction.text.trim()).length,
    0,
  );

  return ingredientCount === 0 && instructionCount === 0;
}

function importErrorCode(error: unknown): string {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  if (code) return code.replace(/^functions\//, "");
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

async function recordTerminalURLImportFailure(params: {
  url: string;
  durationMs: number;
  failureStep: string;
  errorCode: string;
}): Promise<void> {
  try {
    const socialPlatform = detectSocialPlatform(params.url);
    await recordOperationalEvent({
      kind: socialPlatform ? "social_import" : "url_import",
      outcome: "failed",
      durationMs: params.durationMs,
      importURL: params.url,
      platform: socialPlatform ?? "web",
      failureStep: params.failureStep,
      errorCode: params.errorCode,
      appPlatform: "web",
      createDebugInboxItem: true,
    });
  } catch (reportingError) {
    console.error("[Import] recordOperationalEvent failed", reportingError);
  }
}

function importErrorMessage(error: unknown): string {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    code.includes("failed-precondition") ||
    lowerMessage.includes("bot challenge") ||
    lowerMessage.includes("gated")
  ) {
    return "That site is blocking server-side recipe import. Try image import for now while we improve web fallback coverage.";
  }

  if (code.includes("not-found") || lowerMessage.includes("no recipe")) {
    return "We couldn't find a recipe on that page.";
  }

  if (
    code.includes("deadline-exceeded") ||
    code.includes("unavailable") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("failed to fetch")
  ) {
    return "We couldn't reach that recipe page from the web importer.";
  }

  return "We couldn't import a recipe from that URL.";
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
    const parseStartedAt = performance.now();
    let shouldFallbackToManualDraft = false;
    let fallbackURL = "";

    try {
      const activeUser = user ?? await ensureAnonymousUser();
      const userId = activeUser.uid;
      const trimmedURL = url.trim();
      const shareKey = parseCookPilotShareKey(trimmedURL);
      if (shareKey) {
        const resolved = await resolveSharedRecipeImport(shareKey);
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

      shouldFallbackToManualDraft = true;
      fallbackURL = trimmedURL;
      const imported = await importRecipeFromURL(trimmedURL);
      const recipeId = crypto.randomUUID();

      // Mirror social CDN thumbnails (Instagram, TikTok, Pinterest) to Firebase Storage
      // before storing the draft so the pending recipe already holds a permanent URL.
      // Regular recipe site thumbnails are stable links and are stored as-is.
      let recipeData = imported.recipe;
      const isSocialURL = detectSocialPlatform(trimmedURL) !== null;
      if (isSocialURL && recipeData.imageURL && !isFirebaseStorageURL(recipeData.imageURL)) {
        const mirrored = await migrateExternalImageToFirebaseStorage(userId, recipeId, recipeData.imageURL);
        if (mirrored) {
          recipeData = { ...recipeData, imageURL: mirrored };
        }
      }

      if (SocialImportTrace.lastCompletedImportSessionIDValue) {
        console.info(
          `[SocialImport] importSessionLinkedToRecipe importSessionID=${SocialImportTrace.lastCompletedImportSessionIDValue} recipeId=${recipeId} finalParserSource=${imported.finalParserSource}`,
        );
      }

      const fallbackNotice = recipeIsBlank(recipeData) ? URL_IMPORT_FALLBACK_NOTICE : null;
      if (fallbackNotice) {
        // Best-effort telemetry — don't make the user wait on it to see their draft.
        void recordTerminalURLImportFailure({
          url: trimmedURL,
          durationMs: Math.round(performance.now() - parseStartedAt),
          failureStep: "empty_recipe",
          errorCode: "empty_recipe",
        });
      }

      // Store the parsed recipe as a pending draft. The detail page will open in edit
      // mode so the user can review before the first Firestore write happens.
      // Theme colors are extracted lazily on the detail page (mirrors iOS) so the
      // import isn't blocked on downloading and processing the cover image.
      savePendingImportDraft(recipeId, recipeData, trimmedURL, undefined, undefined, fallbackNotice);

      openDraft(recipeId);
    } catch (nextError) {
      console.error(nextError);
      if (shouldFallbackToManualDraft && fallbackURL) {
        // Best-effort telemetry — don't make the user wait on it to see their draft.
        void recordTerminalURLImportFailure({
          url: fallbackURL,
          durationMs: Math.round(performance.now() - parseStartedAt),
          failureStep: "url_parsing",
          errorCode: importErrorCode(nextError),
        });
        const recipeId = crypto.randomUUID();
        savePendingImportDraft(
          recipeId,
          { ingredientSections: [], instructionSections: [], servings: 1 },
          fallbackURL,
          undefined,
          undefined,
          URL_IMPORT_FALLBACK_NOTICE,
        );
        openDraft(recipeId);
        return;
      }
      setError(importErrorMessage(nextError));
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

      // Parsing, uploading, and theme extraction each only need the raw image
      // data, not each other's output — run them concurrently instead of
      // chaining, since parsing (the AI call) is the slow step.
      const [parsedImageRecipe, uploadedImageURL, themeSeedColors] = await Promise.all([
        parseRecipeFromImages(imageDataURLs),
        uploadRecipeImage(activeUser.uid, recipeId, imageFiles[0]),
        extractThemeSeedColorsWithTimeout(imageDataURLs[0]),
      ]);
      const recipeData = { ...parsedImageRecipe.recipe, imageURL: uploadedImageURL };

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
