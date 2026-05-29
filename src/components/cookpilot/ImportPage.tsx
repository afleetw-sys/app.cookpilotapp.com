"use client";

import { ArrowClockwise, ArrowLeft, TrayArrowDown } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { StateBlock } from "@/components/ui/StateBlock";
import { TextField } from "@/components/ui/TextField";
import { isFirebaseStorageURL, migrateExternalImageToFirebaseStorage } from "@/lib/cookpilot/imageStorage";
import { IMPORT_DRAFT_SEARCH_PARAM, savePendingImportDraft } from "@/lib/cookpilot/importDraft";
import { importRecipeFromURL } from "@/lib/cookpilot/importRecipe";
import { SocialImportTrace } from "@/lib/cookpilot/socialImportTrace";
import { detectSocialPlatform } from "@/lib/cookpilot/socialPlatform";
import { parseCookPilotShareId, resolveSharedRecipeImport, importLegacySharedRecipe } from "@/lib/cookpilot/sharedRecipe";

export function ImportRecipePanel({
  onComplete,
  framed = true,
}: {
  onComplete?: (recipeId: string) => void;
  framed?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImportRecipe() {
    if (!user || !url.trim()) return;
    const userId = user.uid;

    setLoading(true);
    setError(null);

    try {
      const trimmedURL = url.trim();
      const shareId = parseCookPilotShareId(trimmedURL);
      if (shareId) {
        const resolved = await resolveSharedRecipeImport(shareId);
        if (!resolved) {
          throw new Error("Shared recipe not found");
        }

        if (resolved.kind === "snapshot") {
          if (onComplete) {
            onComplete(resolved.recipeId);
          } else {
            router.push(`/recipes/${resolved.recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
          }
          return;
        }

        const recipeId = await importLegacySharedRecipe(resolved.sourceURL);
        if (onComplete) {
          onComplete(recipeId);
        } else {
          router.push(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
        }
        return;
      }

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

      // Store the parsed recipe as a pending draft. The detail page will open in edit
      // mode so the user can review before the first Firestore write happens.
      savePendingImportDraft(recipeId, recipeData, trimmedURL);

      if (onComplete) {
        onComplete(recipeId);
      } else {
        router.push(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
      }
    } catch (nextError) {
      console.error(nextError);
      setError("We couldn't import a recipe from that URL.");
      setLoading(false);
    }
  }

  const content = (
    <>
      <TextField
        autoFocus
        label="Recipe URL"
        onChange={(event) => {
          setUrl(event.target.value);
          setError(null);
        }}
        placeholder="https://example.com/recipe"
        type="url"
        value={url}
      />
      <Button disabled={loading || !url.trim()} onClick={() => void handleImportRecipe()}>
        {loading ? (
          <ArrowClockwise className="cp-spin" size={18} />
        ) : (
          <TrayArrowDown size={18} />
        )}
        Import recipe
      </Button>
      {error ? <StateBlock message={error} title="Import issue" tone="error" /> : null}
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
