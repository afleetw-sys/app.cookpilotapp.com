import { RecipesPage } from "@/components/cookpilot/RecipesPage";

export default async function RecipesRoute({
  searchParams,
}: {
  searchParams: Promise<{ dialog?: string }>;
}) {
  const { dialog } = await searchParams;

  return (
    <RecipesPage
      initialDialog={dialog === "import" || dialog === "settings" ? dialog : null}
    />
  );
}
