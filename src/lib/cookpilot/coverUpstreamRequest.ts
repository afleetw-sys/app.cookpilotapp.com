/** Mirrors iOS ParserUtilities mobile Safari UA for CDN hotlink bypass. */
export const RECIPE_COVER_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/**
 * Instagram/TikTok CDNs often 403 without a platform Referer. Server-side proxy uses these;
 * the browser may still load the raw URL when the proxy cannot (cookies / expired signature).
 */
export function upstreamCoverRequestHeaders(target: URL): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": RECIPE_COVER_USER_AGENT,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const host = target.hostname.toLowerCase();
  if (host.includes("cdninstagram.com") || host.endsWith(".instagram.com")) {
    headers.Referer = "https://www.instagram.com/";
    headers.Origin = "https://www.instagram.com";
  } else if (host.includes("tiktokcdn.com") || host.includes("tiktok.com")) {
    headers.Referer = "https://www.tiktok.com/";
    headers.Origin = "https://www.tiktok.com";
  } else if (host.includes("pinimg.com") || host.includes("pinterest.com")) {
    headers.Referer = "https://www.pinterest.com/";
    headers.Origin = "https://www.pinterest.com";
  }

  return headers;
}

/** Instagram `oe` query param is a hex expiry timestamp; past expiry → proxy will 403. */
export function isInstagramCDNURLExpired(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes("cdninstagram.com")) return false;
    const oe = parsed.searchParams.get("oe");
    if (!oe || !/^[0-9a-fA-F]+$/.test(oe)) return false;
    const expiryUnix = Number.parseInt(oe, 16);
    if (!Number.isFinite(expiryUnix)) return false;
    return expiryUnix < Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isSocialCDNHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.includes("cdninstagram.com") ||
    host.includes("tiktokcdn.com") ||
    host.includes("pinimg.com")
  );
}
