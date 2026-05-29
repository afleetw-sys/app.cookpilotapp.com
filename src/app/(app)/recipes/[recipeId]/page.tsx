import { RecipeDetailPage } from "@/components/cookpilot/RecipeDetailPage";
import { IMPORT_DRAFT_SEARCH_PARAM } from "@/lib/cookpilot/importDraft";

export default async function RecipeDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ recipeId }, sp] = await Promise.all([params, searchParams]);
  const isDraft = sp[IMPORT_DRAFT_SEARCH_PARAM] === "1";

  return <RecipeDetailPage recipeId={recipeId} isDraft={isDraft} />;
}
