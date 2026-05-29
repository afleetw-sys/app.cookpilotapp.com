import { SharedRecipeImportPage } from "@/components/cookpilot/SharedRecipeImportPage";

type SharedRecipeRouteProps = {
  params: Promise<{ shareId: string }>;
};

export default async function SharedRecipeRoute({ params }: SharedRecipeRouteProps) {
  const { shareId } = await params;
  return <SharedRecipeImportPage shareId={shareId} />;
}
