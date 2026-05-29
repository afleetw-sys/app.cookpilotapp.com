"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StateBlock } from "@/components/ui/StateBlock";
import { IMPORT_DRAFT_SEARCH_PARAM } from "@/lib/cookpilot/importDraft";
import {
  importLegacySharedRecipe,
  resolveSharedRecipeImport,
} from "@/lib/cookpilot/sharedRecipe";

export function SharedRecipeImportPage({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function importSharedRecipe() {
      try {
        const resolved = await resolveSharedRecipeImport(shareId);
        if (cancelled) return;

        if (!resolved) {
          setErrorMessage("This shared recipe link is no longer available.");
          return;
        }

        if (resolved.kind === "snapshot") {
          router.replace(`/recipes/${resolved.recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
          return;
        }

        const recipeId = await importLegacySharedRecipe(resolved.sourceURL);
        if (cancelled) return;
        router.replace(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setErrorMessage("We couldn't open this shared recipe.");
        }
      }
    }

    void importSharedRecipe();

    return () => {
      cancelled = true;
    };
  }, [router, shareId]);

  if (errorMessage) {
    return (
      <div className="cp-page cp-page--centered">
        <StateBlock message={errorMessage} title="Shared recipe unavailable" tone="error" />
      </div>
    );
  }

  return (
    <div className="cp-page cp-page--centered">
      <LoadingSpinner label="Opening shared recipe" />
    </div>
  );
}
