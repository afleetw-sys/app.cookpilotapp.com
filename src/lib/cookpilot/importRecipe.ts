import { normalizeImportURL } from "@/lib/cookpilot/normalizeImportURL";
import {
  isDeterministicParserSource,
  isLegacySocialAISource,
  PARSER_SOURCE,
} from "@/lib/cookpilot/parserSources";
import { detectSocialPlatform } from "@/lib/cookpilot/socialPlatform";
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
 * for all platforms the server supports: one `parseRecipeFromURL` call, no client-side parsing.
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
    const response = await parseRecipeFromURL(trimmedURL, {
      importSessionID: trace.importSessionID,
    });
    const finalParserSource = response.parser?.source ?? "parseRecipeFromURL";

    if (socialPlatform) {
      trace.logExtraction({
        extractionSource: "server-open-graph",
        captionFound: Boolean(
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
