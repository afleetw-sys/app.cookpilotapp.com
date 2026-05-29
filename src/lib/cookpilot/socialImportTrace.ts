import { detectSocialPlatform, redactedURL, type SocialPlatform } from "@/lib/cookpilot/socialPlatform";

type TraceFields = Record<string, string>;

let activeTrace: SocialImportTrace | null = null;
let lastCompletedImportSessionID: string | null = null;

/**
 * Structured import trace aligned with iOS `SocialImportTrace`.
 * Filter browser devtools console on `[SocialImport]`.
 */
export class SocialImportTrace {
  readonly importSessionID: string;
  readonly platform: SocialPlatform | "web";
  readonly sourceURL: string;

  private readonly startedAt = Date.now();
  private pathSteps: string[] = [];
  private lastErrorReason: string | null = null;
  private didComplete = false;
  private _finalParserSource: string | null = null;

  get finalParserSource(): string | null {
    return this._finalParserSource;
  }

  private constructor(platform: SocialPlatform | "web", sourceURL: string) {
    this.importSessionID = crypto.randomUUID().toLowerCase();
    this.platform = platform;
    this.sourceURL = sourceURL;
  }

  static get active(): SocialImportTrace | null {
    return activeTrace;
  }

  static get lastCompletedImportSessionIDValue(): string | null {
    return lastCompletedImportSessionID;
  }

  static begin(url: string): SocialImportTrace {
    const platform = detectSocialPlatform(url) ?? "web";
    const trace = new SocialImportTrace(platform, url);
    activeTrace = trace;
    trace.emit("import_started", {});
    return trace;
  }

  static endActive(
    outcome: string,
    recipe?: { ingredientCount: number; instructionCount: number; aiConfidence?: string | null },
    finalParserSource?: string | null,
  ): void {
    const trace = activeTrace;
    if (!trace) return;
    activeTrace = null;
    trace.emitComplete(outcome, recipe, finalParserSource ?? null);
  }

  step(description: string): void {
    this.pathSteps.push(description);
    this.emit("import_step", { step: description });
  }

  recordError(reason: string): void {
    this.lastErrorReason = reason;
    this.emit("import_error", { errorReason: reason });
  }

  logExtraction(fields: {
    extractionSource: string;
    captionFound: boolean;
    transcriptFound?: boolean;
    outboundURLFound?: boolean;
    imageFound?: boolean;
  }): void {
    this.step(`extraction:${fields.extractionSource}`);
    this.emit("extraction", {
      extractionSource: fields.extractionSource,
      captionFound: fields.captionFound ? "true" : "false",
      transcriptFound: fields.transcriptFound ? "true" : "false",
      outboundURLFound: fields.outboundURLFound ? "true" : "false",
      imageFound: fields.imageFound ? "true" : "false",
    });
  }

  logParseSocialRecipe(fields: {
    started: boolean;
    succeeded: boolean;
    failed: boolean;
    error?: string;
  }): void {
    if (fields.started) this.step("parseSocialRecipe→started");
    if (fields.succeeded) this.step("parseSocialRecipe→succeeded");
    if (fields.failed) {
      this.step("parseSocialRecipe→failed");
      if (fields.error) this.recordError(fields.error);
    }
    this.emit("parse_social_recipe", {
      started: fields.started ? "true" : "false",
      succeeded: fields.succeeded ? "true" : "false",
      failed: fields.failed ? "true" : "false",
      error: fields.error ?? "",
    });
  }

  logDeterministicParser(succeeded: boolean, source: string): void {
    this.emit("deterministic_parser", {
      succeeded: succeeded ? "true" : "false",
      parserSource: source,
    });
    this.step(succeeded ? `deterministic:${source}` : `deterministic-failed:${source}`);
  }

  logAIFallback(used: boolean, source: string): void {
    this.emit("ai_fallback", {
      used: used ? "true" : "false",
      parserSource: source,
    });
    if (used) this.step(`ai-fallback:${source}`);
  }

  logLocalFallback(used: boolean, source: string): void {
    this.emit("local_fallback", {
      used: used ? "true" : "false",
      parserSource: source,
    });
    if (used) this.step(`local-fallback:${source}`);
  }

  logFinalResult(
    recipe: { ingredientCount: number; instructionCount: number; aiConfidence?: string | null } | null,
    finalParserSource: string,
  ): void {
    this._finalParserSource = finalParserSource;
    const ingredientCount = recipe?.ingredientCount ?? 0;
    const instructionCount = recipe?.instructionCount ?? 0;
    this.emit("import_parser_result", {
      finalParserSource,
      finalIngredientCount: String(ingredientCount),
      finalInstructionCount: String(instructionCount),
      finalConfidence: recipe?.aiConfidence ?? "none",
      finalErrorReason: this.lastErrorReason ?? "",
    });
    this.step(`final:${finalParserSource}`);
  }

  private emitComplete(
    outcome: string,
    recipe: { ingredientCount: number; instructionCount: number; aiConfidence?: string | null } | undefined,
    finalParserSource: string | null,
  ): void {
    if (this.didComplete) return;
    this.didComplete = true;
    lastCompletedImportSessionID = this.importSessionID;

    const parserSource = finalParserSource ?? "unknown";
    if (recipe) {
      this.logFinalResult(recipe, parserSource);
    }

    const durationMs = Date.now() - this.startedAt;
    this.emit("import_complete", {
      outcome,
      parserPath: this.pathSteps.join(" → "),
      finalParserSource: parserSource,
      durationMs: String(durationMs),
      finalIngredientCount: String(recipe?.ingredientCount ?? 0),
      finalInstructionCount: String(recipe?.instructionCount ?? 0),
      finalConfidence: recipe?.aiConfidence ?? "none",
      finalErrorReason: this.lastErrorReason ?? "",
    });
  }

  private emit(event: string, extra: TraceFields): void {
    const payload = {
      importSessionID: this.importSessionID,
      platform: this.platform,
      url: redactedURL(this.sourceURL),
      ...extra,
    };
    const line = Object.entries(payload)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    console.info(`[SocialImport] ${event} ${line}`);
  }
}

export function ingredientCount(recipe: {
  ingredientSections: { ingredients: unknown[] }[];
}): number {
  return recipe.ingredientSections.reduce(
    (count, section) => count + section.ingredients.length,
    0,
  );
}

export function instructionCount(recipe: {
  instructionSections: { instructions: unknown[] }[];
}): number {
  return recipe.instructionSections.reduce(
    (count, section) => count + section.instructions.length,
    0,
  );
}
