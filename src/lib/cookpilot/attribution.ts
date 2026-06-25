// First-touch marketing attribution.
//
// When a visitor lands with UTM parameters (e.g. from a yard-sign QR redirect),
// we persist them to localStorage exactly once. "First touch" means the very
// first attributed visit wins and is never overwritten by later visits, so the
// channel that originally brought the user in is preserved through signup.

const ATTRIBUTION_STORAGE_KEY = "cookpilot.attribution.firstTouch";

// The campaign params we capture and then clean out of the visible URL. Limited
// to the standard utm_* set so unrelated query params are always preserved.
const UTM_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type StoredAttribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  first_touch_at: string;
};

export function getStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredAttribution> | null;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      utm_source: parsed.utm_source ?? null,
      utm_medium: parsed.utm_medium ?? null,
      utm_campaign: parsed.utm_campaign ?? null,
      first_touch_at: parsed.first_touch_at ?? "",
    };
  } catch {
    return null;
  }
}

export function clearStoredAttribution(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Best-effort only; storage may be unavailable.
  }
}

/**
 * Records first-touch UTM attribution from a URL query string (defaults to the
 * current page's). No-op if attribution was already captured, or if this visit
 * carries no UTM parameters. Safe to call on every page load.
 */
export function captureAttributionFromUrl(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): void {
  if (typeof window === "undefined") return;

  // First touch wins: never overwrite an existing record.
  try {
    if (window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)) return;
  } catch {
    return;
  }

  const params = new URLSearchParams(search);
  const utm_source = params.get("utm_source");
  const utm_medium = params.get("utm_medium");
  const utm_campaign = params.get("utm_campaign");

  // Only persist when this visit actually carries campaign attribution.
  if (!utm_source && !utm_medium && !utm_campaign) return;

  const record: StoredAttribution = {
    utm_source,
    utm_medium,
    utm_campaign,
    first_touch_at: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Best-effort only; storage may be unavailable (private mode, quota).
  }
}

/**
 * Removes the utm_* params from the visible URL via history.replaceState,
 * preserving the path, any unrelated query params, and the hash. Does not
 * trigger a navigation or reload, and keeps the existing history state object so
 * the Next.js App Router is not disrupted.
 *
 * Call this AFTER analytics has recorded the pageview — stripping the params too
 * early would hide the campaign from GA's URL-based attribution.
 */
export function stripUtmParamsFromUrl(): void {
  if (typeof window === "undefined") return;

  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of UTM_PARAM_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    if (!changed) return;

    const search = url.searchParams.toString();
    const cleanedUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    // Reuse the current history state so router/navigation state is preserved.
    window.history.replaceState(window.history.state, "", cleanedUrl);
  } catch {
    // Best-effort; never block on URL cleanup.
  }
}
