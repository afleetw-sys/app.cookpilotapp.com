import { SharedRecipeImportPage } from "@/components/cookpilot/SharedRecipeImportPage";

type SharedRecipeRouteProps = {
  params: Promise<{ shareId: string }>;
};

export default async function SharedRecipeShortRoute({ params }: SharedRecipeRouteProps) {
  const { shareId: shareKey } = await params;
  return <SharedRecipeImportPage shareKey={shareKey} />;
}
