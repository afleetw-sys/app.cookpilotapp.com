import type { RecipeThemeSeedColors } from "@/lib/cookpilot/types";

type RGB = [number, number, number];

export type RecipePalette = {
  background: string;
  backgroundDark: string;
  primaryAccent: string;
  primaryAccentDark: string;
  textButtonFill: string;
  textButtonFillDark: string;
  chipFill: string;
  chipFillDark: string;
  chipText: string;        // chipAccentOnChipFill — text on chip fill
  chipTextDark: string;
  chipAccent: string;      // the chip accent color (may use secondary hue)
  chipAccentDark: string;
  chipAccentOnBg: string;  // accessible chip text on light page background
  chipAccentOnBgDark: string; // accessible chip text on dark page background
  inputFill: string;       // tinted input background (light)
  inputFillDark: string;   // tinted input background (dark)
  onPrimary: string;       // text/icon on primaryAccent buttons
  onPrimaryDark: string;
  primaryBaseMix: string;
  primaryBaseMixDark: string;
  primaryTopGlowMix: string;
  primaryTopGlowMixDark: string;
  primaryTopGlowSoftMix: string;
  primaryTopGlowSoftMixDark: string;
};

function hsbToRgb(h: number, s: number, b: number): RGB {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);
  let r: number, g: number, bl: number;
  switch (i % 6) {
    case 0: r = b; g = t; bl = p; break;
    case 1: r = q; g = b; bl = p; break;
    case 2: r = p; g = b; bl = t; break;
    case 3: r = p; g = q; bl = b; break;
    case 4: r = t; g = p; bl = b; break;
    default: r = b; g = p; bl = q; break;
  }
  return [r * 255, g * 255, bl * 255];
}

function toHex(r: number, g: number, b: number): string {
  const hex = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function mixRgb(
  c1: RGB,
  c2: RGB,
  t: number,
): RGB {
  const f = Math.max(0, Math.min(t, 1));
  return [
    c1[0] * (1 - f) + c2[0] * f,
    c1[1] * (1 - f) + c2[1] * f,
    c1[2] * (1 - f) + c2[2] * f,
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(
  c1: RGB,
  c2: RGB,
): number {
  const l1 = relativeLuminance(...c1);
  const l2 = relativeLuminance(...c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function blendRgb(
  c1: RGB,
  c2: RGB,
  t: number,
): RGB {
  return mixRgb(c1, c2, t);
}

function foregroundColor(
  bg: RGB,
  minRatio = 3,
): RGB {
  const black: RGB = [0, 0, 0];
  const white: RGB = [255, 255, 255];
  const blackRatio = contrastRatio(black, bg);
  const whiteRatio = contrastRatio(white, bg);

  if (blackRatio >= minRatio || whiteRatio >= minRatio) {
    return blackRatio >= whiteRatio ? black : white;
  }

  return blackRatio >= whiteRatio ? black : white;
}

function adjustForContrast(
  foreground: RGB,
  background: RGB,
  minRatio = 4.5,
): RGB {
  if (contrastRatio(foreground, background) >= minRatio) return foreground;

  const black: RGB = [0, 0, 0];
  const white: RGB = [255, 255, 255];
  const blackRatio = contrastRatio(black, background);
  const whiteRatio = contrastRatio(white, background);
  const target = whiteRatio >= blackRatio ? white : black;
  const bestPossible = Math.max(blackRatio, whiteRatio);
  if (bestPossible < minRatio) return target;

  let low = 0;
  let high = 1;
  let best = target;

  for (let attempt = 0; attempt < 18; attempt++) {
    const mid = (low + high) / 2;
    const candidate = blendRgb(foreground, target, mid);
    if (contrastRatio(candidate, background) >= minRatio) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}

function accessibleTintForScheme(
  h: number,
  s: number,
  b: number,
  scheme: "light" | "dark",
): RGB {
  if (scheme === "light") {
    return hsbToRgb(h, Math.min(s * 1.05, 0.95), Math.max(b * 0.75, 0.25));
  }
  return hsbToRgb(h, Math.min(s * 0.25, 0.25), Math.min(Math.max(b + 0.65, 0.9), 1));
}

/** Matches iOS `inputFillFromBackground` in ThemeExtraction.swift */
function inputFillFromBackground(
  h: number,
  s: number,
  b: number,
  isDark: boolean,
): RGB {
  const newS = Math.min(s + 0.05, 0.25);
  const newB = isDark ? Math.min(b + 0.02, 0.19) : Math.max(b - 0.04, 0.88);
  return hsbToRgb(h, newS, newB);
}

export function buildRecipePalette(seed: RecipeThemeSeedColors): RecipePalette {
  const { primaryH, primaryS, primaryB, secondaryH, secondaryS, secondaryB } = seed;

  // Light background: very low saturation tint of primary hue (matches Swift)
  const lightBgRgb = hsbToRgb(primaryH, 0.07, 0.97);
  const background = toHex(...lightBgRgb);

  // Dark background: deeper, more saturated
  const darkBgRgb = hsbToRgb(primaryH, 0.18, 0.14);
  const backgroundDark = toHex(...darkBgRgb);

  // Primary accent (clamped, matches Swift lightPrimaryS/B)
  const minBrightnessDark = 0.45;
  const satScaleDark = 0.88;
  const lightPrimaryS = Math.min(primaryS, 0.92);
  const lightPrimaryB = Math.max(Math.min(primaryB, 0.88), 0.38);
  const darkPrimaryS = lightPrimaryS * satScaleDark;
  const darkPrimaryB = Math.max(lightPrimaryB, minBrightnessDark);
  const primaryAccentRgb = hsbToRgb(primaryH, lightPrimaryS, lightPrimaryB);
  const primaryAccentDarkRgb = hsbToRgb(primaryH, darkPrimaryS, darkPrimaryB);
  const primaryAccent = toHex(...primaryAccentRgb);
  const primaryAccentDark = toHex(...primaryAccentDarkRgb);

  // Chip hue: secondary if hue distance >= 0.10, else primary (matches Swift)
  const hueDiff = Math.min(Math.abs(secondaryH - primaryH), 1 - Math.abs(secondaryH - primaryH));
  const useSecondary = hueDiff >= 0.10;
  const chipH = useSecondary ? secondaryH : primaryH;
  const chipS = useSecondary ? secondaryS : primaryS;
  const chipB = useSecondary ? secondaryB : primaryB;

  const lightChipS = Math.min(Math.max(chipS, 0.45), 0.9);
  const lightChipB = Math.max(Math.min(chipB, 0.88), 0.4);
  const darkChipS = lightChipS * satScaleDark;
  const darkChipB = Math.max(lightChipB, minBrightnessDark);
  const chipAccentRgb = hsbToRgb(chipH, lightChipS, lightChipB);
  const chipAccentDarkRgb = hsbToRgb(chipH, darkChipS, darkChipB);
  const chipAccent = toHex(...chipAccentRgb);
  const chipAccentDark = toHex(...chipAccentDarkRgb);

  // Chip fill = mix(lightBg, chipAccent, 14%)
  const chipFillRgb = mixRgb(lightBgRgb, chipAccentRgb, 0.14);
  const chipFillDarkRgb = mixRgb(darkBgRgb, chipAccentDarkRgb, 0.14);
  const chipFill = toHex(...chipFillRgb);
  const chipFillDark = toHex(...chipFillDarkRgb);

  const chipText = toHex(...adjustForContrast(chipAccentRgb, chipFillRgb, 4.5));
  const chipTextDark = toHex(...adjustForContrast(chipAccentDarkRgb, chipFillDarkRgb, 4.5));

  const textButtonFillRgb = adjustForContrast(primaryAccentRgb, lightBgRgb, 4.5);
  const textButtonFillDarkRgb = adjustForContrast(primaryAccentDarkRgb, darkBgRgb, 4.5);
  const textButtonFill = toHex(...textButtonFillRgb);
  const textButtonFillDark = toHex(...textButtonFillDarkRgb);

  const chipAccentOnBg = toHex(...accessibleTintForScheme(chipH, lightChipS, lightChipB, "light"));
  const chipAccentOnBgDark = toHex(...accessibleTintForScheme(chipH, darkChipS, darkChipB, "dark"));

  // inputFill: derived from recipe background (matches iOS ThemeExtraction)
  const inputFillRgb = inputFillFromBackground(primaryH, 0.07, 0.97, false);
  const inputFill = toHex(...inputFillRgb);

  const inputFillDarkRgb = mixRgb(darkBgRgb, primaryAccentRgb, 0.07);
  const inputFillDark = toHex(...inputFillDarkRgb);

  const onPrimary = toHex(...foregroundColor(textButtonFillRgb, 3));
  const onPrimaryDark = toHex(...foregroundColor(textButtonFillDarkRgb, 3));

  const primaryBaseMix = `${(6 + lightPrimaryS * 3).toFixed(3)}%`;
  const primaryBaseMixDark = `${(6 + darkPrimaryS * 3).toFixed(3)}%`;
  const primaryTopGlowMix = `${(6 + lightPrimaryB * 2).toFixed(3)}%`;
  const primaryTopGlowMixDark = `${(6 + darkPrimaryB * 2).toFixed(3)}%`;
  const primaryTopGlowSoftMix = `${((6 + lightPrimaryB * 2) * 0.2).toFixed(3)}%`;
  const primaryTopGlowSoftMixDark = `${((6 + darkPrimaryB * 2) * 0.2).toFixed(3)}%`;

  return {
    background,
    backgroundDark,
    primaryAccent,
    primaryAccentDark,
    textButtonFill,
    textButtonFillDark,
    chipFill,
    chipFillDark,
    chipText,
    chipTextDark,
    chipAccent,
    chipAccentDark,
    chipAccentOnBg,
    chipAccentOnBgDark,
    inputFill,
    inputFillDark,
    onPrimary,
    onPrimaryDark,
    primaryBaseMix,
    primaryBaseMixDark,
    primaryTopGlowMix,
    primaryTopGlowMixDark,
    primaryTopGlowSoftMix,
    primaryTopGlowSoftMixDark,
  };
}
