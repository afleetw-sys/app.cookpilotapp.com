const STORAGE_KEY = "cookpilot-recently-viewed";
const MAX_ENTRIES = 200;

/** Recipe id → viewed-at time in milliseconds since epoch */
type RecentlyViewedMap = Record<string, number>;

function canUseStorage() {
  return typeof window !== "undefined";
}

function parseStoredTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Legacy numeric seconds (iOS-style) vs milliseconds
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readMap(): RecentlyViewedMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const map: RecentlyViewedMap = {};
    for (const [recipeId, value] of Object.entries(parsed)) {
      if (typeof recipeId !== "string") continue;
      const timestamp = parseStoredTimestamp(value);
      if (timestamp !== null) {
        map[recipeId] = timestamp;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function pruneMap(map: RecentlyViewedMap): RecentlyViewedMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_ENTRIES) return map;

  const sorted = entries.sort(([, left], [, right]) => left - right);
  return Object.fromEntries(sorted.slice(entries.length - MAX_ENTRIES));
}

function writeMap(nextMap: RecentlyViewedMap) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneMap(nextMap)));
  } catch {
    // Ignore storage failures; sort will gracefully fall back.
  }
}

export function getRecentlyViewedTimestamps(): Record<string, number> {
  return { ...readMap() };
}

export function recordRecipeViewedAt(recipeId: string, viewedAt = Date.now()): number {
  const nextMap = readMap();
  nextMap[recipeId] = viewedAt;
  writeMap(nextMap);
  return viewedAt;
}

export function recordRecipeViewed(recipeId: string) {
  recordRecipeViewedAt(recipeId);
}
