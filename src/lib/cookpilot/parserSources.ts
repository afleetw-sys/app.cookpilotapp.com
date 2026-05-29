/** Parser `source` values returned by Cloud Functions — keep in sync with functions + iOS. */

export const PARSER_SOURCE = {
  jsonLd: "json-ld",
  htmlHeuristic: "html-heuristic",
  socialDocument: "social-document",
  socialText: "social-text",
} as const;

export type ParserSource = (typeof PARSER_SOURCE)[keyof typeof PARSER_SOURCE];

const DETERMINISTIC_SOURCES: ReadonlySet<string> = new Set([
  PARSER_SOURCE.jsonLd,
  PARSER_SOURCE.htmlHeuristic,
  PARSER_SOURCE.socialDocument,
  PARSER_SOURCE.socialText,
]);

/** True when the server used the shared deterministic pipeline (never legacy `social-ai`). */
export function isDeterministicParserSource(source: string | undefined): boolean {
  return source !== undefined && DETERMINISTIC_SOURCES.has(source);
}

export function isLegacySocialAISource(source: string | undefined): boolean {
  return source === "social-ai";
}
