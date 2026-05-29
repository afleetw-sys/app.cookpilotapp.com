# Recipe import parsing (web ↔ iOS ↔ Cloud Functions)

## One pipeline for recipe blogs

Both **CookPilotWeb** and **iOS** use **`parseRecipeFromURL`** for normal recipe URLs:

1. **JSON-LD** (structured Recipe schema)
2. **HTML heuristics** (same order as iOS `WebRecipeParser`):
   - Microdata (`recipeIngredient` / `recipeInstructions`)
   - Structured / recipe-card DOM (`structuredSections` + `htmlPatterns`)
   - Visible recipe block scoring
   - Line parser fallback (scoped HTML window, not raw full-page scrape)

Implementation: `CookPilot/functions/src/recipe/webRecipe/` (TypeScript ports of iOS parsers).

## Client differences

| Platform | Extraction | Parsing |
|----------|------------|---------|
| **Web** | Server fetches URL | `parseRecipeFromURL` |
| **iOS blogs** | Server fetch via CF; on-device fallback if CF fails | Same |
| **iOS Instagram** | Local WebView caption → CF with `caption` | `parseRecipeFromURL` + on-device fallback |
| **iOS TikTok / Pinterest / YouTube** | On-device platform parsers | Local |

Optional request fields for social (iOS):

```ts
{ url, caption?, title?, description?, transcript?, imageURL? }
```

Server prefers client text over Open Graph for social URLs.

## Deploy

```bash
cd CookPilot/functions && npm run build && firebase deploy --only functions:parseRecipeFromURL,functions:parseSocialRecipe
```
