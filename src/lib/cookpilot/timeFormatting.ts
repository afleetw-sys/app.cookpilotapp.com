/**
 * Recipe time string utilities.
 * Port of CookPilotCore/Sources/CookPilotCore/Utilities/TimeFormatting.swift (iOS).
 *
 * Handles:
 *  - Plain values: "30 min", "1 hour 30 minutes", "90m"
 *  - HH:MM format: "1:30"
 *  - Ranges: "15-20 min", "1-2 hours"
 *  - Multiple languages: English, French, Spanish, German
 */

/** Format hours + minutes into a compact string like "1h 30min". */
export function formatTime(hours: number, minutes: number): string {
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

/**
 * Normalize a raw time string into a compact "1h 30min" form.
 * Large minute-only values are automatically promoted to hours+minutes.
 * Returns the original string unchanged if it cannot be parsed.
 */
export function normalizeTimeString(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return raw ?? null;

  const lower = trimmed.toLowerCase();

  // Handle ranges like "15-20 min" or "1-2 hours"
  const rangeMatch = lower.match(/^(\d+)\s*-\s*(\d+)\s*(hour|hours|hr|hrs|h|min|minute|minutes|m)\b/);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    const unit = rangeMatch[3];
    if (unit.startsWith("h") || unit.includes("hour")) {
      return `${lo}-${hi}h`;
    }
    return `${lo}-${hi}min`;
  }

  // Handle HH:MM format (e.g. "1:30")
  if (/^\d{1,2}:\d{2}$/.test(lower)) {
    const [h, m] = lower.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return formatTime(h, m);
    }
  }

  // Tokenize and accumulate minutes
  let totalMinutes = 0;
  let found = false;

  const tokenRegex = /(\d+(?:\.\d+)?)\s*([a-zÀ-ÿ]*)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(lower)) !== null) {
    const value = Number(match[1]);
    const unit = match[2].trim();
    if (!Number.isFinite(value)) continue;

    // Multilingual unit recognition
    // Hours: h, hr, hrs, hour, hours, heure, heures (FR), hora, horas (ES), stunde, stunden (DE)
    // Minutes: m, min, mins, minute, minutes, minuto, minutos (ES), minuten (DE)
    const isHour =
      unit === "h" || unit === "hr" || unit === "hrs" ||
      unit === "hour" || unit === "hours" ||
      unit === "heure" || unit === "heures" ||
      unit === "hora" || unit === "horas" ||
      unit === "stunde" || unit === "stunden";

    const isMinute =
      unit === "m" || unit === "min" || unit === "mins" ||
      unit === "minute" || unit === "minutes" ||
      unit === "minuto" || unit === "minutos" ||
      unit === "minuten";

    if (isHour) {
      totalMinutes += Math.round(value) * 60;
      found = true;
    } else if (isMinute || unit === "") {
      totalMinutes += Math.round(value);
      found = true;
    }
  }

  if (!found) return trimmed;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return formatTime(hours, minutes);
}

/**
 * Add a space before unit abbreviations for human-readable display.
 * "10min" → "10 min", "1h 30min" → "1 hr 30 min"
 */
export function forDisplayTime(value: string | null | undefined): string | null {
  if (!value?.trim()) return value ?? null;
  return value
    .replace(/(\d)(min)\b/g, "$1 min")
    .replace(/(\d)(h)\b/g, "$1 hr");
}

/**
 * Extract total minutes from one or more time strings.
 * Returns null if nothing parseable is found.
 *
 * This is the canonical replacement for the private `totalTimeMinutes` function
 * previously inlined in firestore.ts.
 */
export function totalTimeMinutes(
  ...timeParts: (string | null | undefined)[]
): number | null {
  let total = 0;
  let found = false;

  for (const part of timeParts) {
    if (!part?.trim()) continue;
    const lower = part.toLowerCase();

    // Use the same multilingual regex as normalizeTimeString
    const tokenRegex = /(\d+(?:\.\d+)?)\s*([a-zÀ-ÿ]*)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(lower)) !== null) {
      const value = Number(match[1]);
      const unit = match[2].trim();
      if (!Number.isFinite(value)) continue;

      const isHour =
        unit === "h" || unit === "hr" || unit === "hrs" ||
        unit === "hour" || unit === "hours" ||
        unit === "heure" || unit === "heures" ||
        unit === "hora" || unit === "horas" ||
        unit === "stunde" || unit === "stunden";

      const isMinute =
        unit === "m" || unit === "min" || unit === "mins" ||
        unit === "minute" || unit === "minutes" ||
        unit === "minuto" || unit === "minutos" ||
        unit === "minuten";

      if (isHour) {
        total += Math.round(value) * 60;
        found = true;
      } else if (isMinute) {
        total += Math.round(value);
        found = true;
      }
    }
  }

  return found ? total : null;
}
