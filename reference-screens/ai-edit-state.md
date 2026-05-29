# AI Edit State

Native source:
- `RecipeDetailView.swift`
- `AIModificationViews.swift`
- `RecipeDetailIOSInlineEditColumnView.swift`

Key visual traits:
- AI edit is embedded into recipe detail, not broken into a different visual mode
- loading, refusal, and confidence states are informative but still visually on-brand
- confidence copy feels like supporting metadata, not a warning banner unless refusal/error occurs

Browser primitives used:
- multiline input
- primary button
- state block
- AI summary panel
