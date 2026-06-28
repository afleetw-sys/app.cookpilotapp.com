import type { Metadata } from "next";
import { SharedRecipeImportPage } from "@/components/cookpilot/SharedRecipeImportPage";
import { buildSharedRecipeMetadata } from "@/lib/cookpilot/sharedRecipeMetadata";

type SharedRecipeRouteProps = {
  params: Promise<{ shareId: string }>;
};

export async function generateMetadata({ params }: SharedRecipeRouteProps): Promise<Metadata> {
  const { shareId } = await params;
  return buildSharedRecipeMetadata(shareId, "shared");
}

export default async function SharedRecipeRoute({ params }: SharedRecipeRouteProps) {
  const { shareId: shareKey } = await params;
  return <SharedRecipeImportPage shareKey={shareKey} />;
}
