import { normalizeImportURL } from "@/lib/cookpilot/normalizeImportURL";
import {
  isDeterministicParserSource,
  isLegacySocialAISource,
  PARSER_SOURCE,
} from "@/lib/cookpilot/parserSources";
import { detectSocialPlatform } from "@/lib/cookpilot/socialPlatform";
import { extractSocialMetadataInBrowser } from "@/lib/cookpilot/socialClientExtraction";
import {
  ingredientCount,
  instructionCount,
  SocialImportTrace,
} from "@/lib/cookpilot/socialImportTrace";
import { parseRecipeFromURL, type ParseRecipeFromUrlResponse } from "@/lib/cookpilot/functions";
import type { RecipeData } from "@/lib/cookpilot/types";

export type ImportRecipeFromURLResult = {
  recipe: RecipeData;
  importSessionID: string;
  finalParserSource: string;
  parser: ParseRecipeFromUrlResponse["parser"];
};

function recipeTraceStats(recipe: RecipeData) {
  return {
    ingredientCount: ingredientCount(recipe),
    instructionCount: instructionCount(recipe),
    aiConfidence: recipe.aiConfidence ?? null,
  };
}

/**
 * Web import entry point — identical contract to iOS `RecipeParserService.extractRecipeFromURL`
 * for all platforms the server supports: one `parseRecipeFromURL` call with
 * optional browser-visible social metadata.
 */
export async function importRecipeFromURL(url: string): Promise<ImportRecipeFromURLResult> {
  const trimmedURL = normalizeImportURL(url);
  const trace = SocialImportTrace.begin(trimmedURL);
  const socialPlatform = detectSocialPlatform(trimmedURL);

  trace.step(
    socialPlatform ?
      "parseOrder=parseRecipeFromURL(social)" :
      "parseOrder=parseRecipeFromURL(web)",
  );

  try {
    const extraction = await extractSocialMetadataInBrowser(trimmedURL, socialPlatform);
    const response = await parseRecipeFromURL(trimmedURL, {
      importSessionID: trace.importSessionID,
      ...(extraction ? { extraction } : {}),
    });
    const finalParserSource = response.parser?.source ?? "parseRecipeFromURL";

    if (socialPlatform) {
      trace.logExtraction({
        extractionSource: extraction ? "client-oembed" : "server-open-graph",
        captionFound: Boolean(
          extraction?.caption?.trim() ||
            extraction?.description?.trim() ||
            extraction?.title?.trim() ||
            response.recipe.description?.trim() ||
            response.recipe.title?.trim(),
        ),
        transcriptFound: false,
        outboundURLFound: false,
        imageFound: Boolean(response.recipe.imageURL),
      });
      trace.logDeterministicParser(
        isDeterministicParserSource(finalParserSource),
        finalParserSource,
      );
      trace.logAIFallback(isLegacySocialAISource(finalParserSource), "legacy-social-ai");
      trace.logLocalFallback(false, "none");
      if (response.parser?.usedTranscriptFallback) {
        trace.step("transcript-fallback");
      }
    } else {
      trace.logDeterministicParser(
        finalParserSource === PARSER_SOURCE.jsonLd ||
          finalParserSource === PARSER_SOURCE.htmlHeuristic,
        finalParserSource,
      );
      trace.logAIFallback(false, "none");
      trace.logLocalFallback(false, "none");
    }

    SocialImportTrace.endActive(
      "success",
      recipeTraceStats(response.recipe),
      finalParserSource,
    );

    return {
      recipe: response.recipe,
      importSessionID: trace.importSessionID,
      finalParserSource,
      parser: response.parser,
    };
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    trace.recordError(errorText);
    SocialImportTrace.endActive("failed", undefined, "none");
    throw error;
  }
}
