export type SocialPlatform = "instagram" | "tiktok" | "pinterest" | "youtube";

export function detectSocialPlatform(urlString: string): SocialPlatform | null {
  try {
    const host = new URL(urlString.trim()).hostname.toLowerCase();
    if (host.includes("instagram.com") || host === "instagr.am") {
      return "instagram";
    }
    if (host.includes("tiktok.com")) {
      return "tiktok";
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      return "youtube";
    }
    if (host.includes("pinterest.com") || host === "pin.it") {
      return "pinterest";
    }
  } catch {
    return null;
  }
  return null;
}

export function redactedURL(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}
