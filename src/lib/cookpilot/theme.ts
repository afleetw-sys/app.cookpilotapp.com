import type { RecipeThemeSeedColors } from "@/lib/cookpilot/types";

export type RecipePalette = {
  background: string;
  backgroundDark: string;
  primaryAccent: string;
  chipFill: string;
  chipText: string;        // chipAccentOnChipFill — text on chip fill
  chipAccent: string;      // the chip accent color (may use secondary hue)
  chipAccentOnBg: string;  // accessible chip text on light page background
  chipAccentOnBgDark: string; // accessible chip text on dark page background
  inputFill: string;       // tinted input background (light)
  inputFillDark: string;   // tinted input background (dark)
  onPrimary: string;       // text/icon on primaryAccent buttons
};

function hsbToRgb(h: number, s: number, b: number): [number, number, number] {
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
  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)];
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function mixRgb(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  const f = Math.max(0, Math.min(t, 1));
  return [
    Math.round(c1[0] * (1 - f) + c2[0] * f),
    Math.round(c1[1] * (1 - f) + c2[1] * f),
    Math.round(c1[2] * (1 - f) + c2[2] * f),
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
  c1: [number, number, number],
  c2: [number, number, number],
): number {
  const l1 = relativeLuminance(...c1);
  const l2 = relativeLuminance(...c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Returns the darkest accessible shade of [h, s] that achieves >= 4.5:1 on bg.
// Starts at the given brightness and steps darker until contrast is met.
function accessibleDarkShade(
  h: number,
  s: number,
  startB: number,
  bg: [number, number, number],
): [number, number, number] {
  let bri = Math.max(startB, 0.15);
  for (let attempt = 0; attempt < 20; attempt++) {
    const rgb = hsbToRgb(h, Math.min(s + 0.06, 0.99), bri);
    if (contrastRatio(rgb, bg) >= 4.5) return rgb;
    bri = Math.max(bri - 0.05, 0.05);
  }
  return [17, 17, 17]; // near-black fallback
}

// Returns the brightest accessible shade of [h, s] that achieves >= 4.5:1 on bg.
function accessibleBrightShade(
  h: number,
  s: number,
  startB: number,
  bg: [number, number, number],
): [number, number, number] {
  let bri = Math.min(startB, 0.95);
  for (let attempt = 0; attempt < 20; attempt++) {
    const rgb = hsbToRgb(h, Math.max(s - 0.06, 0.3), bri);
    if (contrastRatio(rgb, bg) >= 4.5) return rgb;
    bri = Math.min(bri + 0.05, 1.0);
  }
  return [238, 238, 238]; // near-white fallback
}

/** Matches iOS `inputFillFromBackground` in ThemeExtraction.swift */
function inputFillFromBackground(
  h: number,
  s: number,
  b: number,
  isDark: boolean,
): [number, number, number] {
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
  const lightPrimaryS = Math.min(primaryS, 0.92);
  const lightPrimaryB = Math.max(Math.min(primaryB, 0.88), 0.38);
  const primaryAccentRgb = hsbToRgb(primaryH, lightPrimaryS, lightPrimaryB);
  const primaryAccent = toHex(...primaryAccentRgb);

  // Chip hue: secondary if hue distance >= 0.10, else primary (matches Swift)
  const hueDiff = Math.min(Math.abs(secondaryH - primaryH), 1 - Math.abs(secondaryH - primaryH));
  const useSecondary = hueDiff >= 0.10;
  const chipH = useSecondary ? secondaryH : primaryH;
  const chipS = useSecondary ? secondaryS : primaryS;
  const chipB = useSecondary ? secondaryB : primaryB;

  const lightChipS = Math.min(Math.max(chipS, 0.45), 0.9);
  const lightChipB = Math.max(Math.min(chipB, 0.88), 0.4);
  const chipAccentRgb = hsbToRgb(chipH, lightChipS, lightChipB);
  const chipAccent = toHex(...chipAccentRgb);

  // Chip fill = mix(lightBg, chipAccent, 14%)
  const chipFillRgb = mixRgb(lightBgRgb, chipAccentRgb, 0.14);
  const chipFill = toHex(...chipFillRgb);

  // Chip text (chipAccentOnChipFill): dark shade verified for 4.5:1 contrast on chipFill
  const darkChipRgb = hsbToRgb(chipH, Math.min(lightChipS + 0.08, 0.99), Math.max(lightChipB - 0.38, 0.18));
  const fillLum = relativeLuminance(...chipFillRgb);
  const darkLum = relativeLuminance(...darkChipRgb);
  const chipFillContrast = (Math.max(fillLum, darkLum) + 0.05) / (Math.min(fillLum, darkLum) + 0.05);
  const chipText = chipFillContrast >= 4.5 ? toHex(...darkChipRgb) : "#111111";

  // chipAccentOnBg: accessible chip color on light page background
  const chipOnBgRgb = accessibleDarkShade(chipH, lightChipS, lightChipB - 0.30, lightBgRgb);
  const chipAccentOnBg = toHex(...chipOnBgRgb);

  // chipAccentOnBgDark: accessible chip color on dark page background (bright shade)
  const chipOnBgDarkRgb = accessibleBrightShade(chipH, lightChipS, lightChipB + 0.10, darkBgRgb);
  const chipAccentOnBgDark = toHex(...chipOnBgDarkRgb);

  // inputFill: derived from recipe background (matches iOS ThemeExtraction)
  const inputFillRgb = inputFillFromBackground(primaryH, 0.07, 0.97, false);
  const inputFill = toHex(...inputFillRgb);

  const inputFillDarkRgb = mixRgb(darkBgRgb, primaryAccentRgb, 0.07);
  const inputFillDark = toHex(...inputFillDarkRgb);

  // onPrimary: white or black for WCAG AA contrast on primaryAccent
  const whiteLum = 1.0;
  const accentLum = relativeLuminance(...primaryAccentRgb);
  const whiteContrast = (Math.max(whiteLum, accentLum) + 0.05) / (Math.min(whiteLum, accentLum) + 0.05);
  const onPrimary = whiteContrast >= 4.5 ? "#ffffff" : "#111111";

  return {
    background,
    backgroundDark,
    primaryAccent,
    chipFill,
    chipText,
    chipAccent,
    chipAccentOnBg,
    chipAccentOnBgDark,
    inputFill,
    inputFillDark,
    onPrimary,
  };
}
