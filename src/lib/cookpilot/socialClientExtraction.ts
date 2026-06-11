import type { ClientRecipeExtraction } from "@/lib/cookpilot/clientExtraction";
import type { SocialPlatform } from "@/lib/cookpilot/socialPlatform";

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

const OEMBED_ENDPOINTS: Partial<Record<SocialPlatform, (url: string) => string>> = {
  youtube: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
};

function extractionFromOEmbed(payload: OEmbedResponse): ClientRecipeExtraction | null {
  const title = payload.title?.trim() || null;
  const author = payload.author_name?.trim() || null;
  const imageURL = payload.thumbnail_url?.trim() || null;

  if (!title && !author && !imageURL) return null;

  return {
    title,
    description: [title, author ? `by ${author}` : null].filter(Boolean).join("\n"),
    imageURL,
  };
}

export async function extractSocialMetadataInBrowser(
  url: string,
  platform: SocialPlatform | null,
): Promise<ClientRecipeExtraction | null> {
  if (!platform) return null;

  const endpoint = OEMBED_ENDPOINTS[platform]?.(url);
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      headers: {Accept: "application/json"},
    });
    if (!response.ok) return null;

    const payload = await response.json() as OEmbedResponse;
    return extractionFromOEmbed(payload);
  } catch {
    return null;
  }
}
