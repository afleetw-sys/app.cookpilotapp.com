import type { Metadata } from "next";
import { fetchSharedRecipeOpenGraph } from "@/lib/cookpilot/sharedRecipeFirestore";

const SITE_ORIGIN = "https://app.cookpilotapp.com";

/**
 * Builds Open Graph / Twitter metadata for a shared recipe link so the recipe
 * photo, title, and description appear in rich link previews (iMessage, etc.) —
 * matching what the iOS share sheet attaches. Falls back to generic CookPilot
 * branding when the share can't be resolved or carries no cover image.
 */
export async function buildSharedRecipeMetadata(
  shareKey: string,
  pathPrefix: "r" | "shared",
): Promise<Metadata> {
  const canonicalUrl = `${SITE_ORIGIN}/${pathPrefix}/${encodeURIComponent(shareKey)}`;

  let og: Awaited<ReturnType<typeof fetchSharedRecipeOpenGraph>> = null;
  try {
    og = await fetchSharedRecipeOpenGraph(shareKey);
  } catch (error) {
    // A preview-metadata failure must never break the page itself — fall back
    // to generic branding below.
    console.error("[ShareLink] buildSharedRecipeMetadata failed", error);
  }

  const title = og?.title ? `${og.title} from CookPilot` : "Recipe from CookPilot";
  const description =
    og?.description ?? "Save, scale, and tweak this recipe with CookPilot.";
  const images = og?.imageURL ? [{ url: og.imageURL, alt: og.title ?? "Recipe" }] : undefined;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: "CookPilot",
      title,
      description,
      url: canonicalUrl,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
    alternates: { canonical: canonicalUrl },
  };
}
