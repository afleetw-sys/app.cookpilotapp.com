import type { RecipeThemeSeedColors } from "@/lib/cookpilot/types";

// Ports the iOS ThemeExtraction.swift algorithm to the browser using Canvas.
// Returns null silently on CORS failure or images with no suitable colors.
//
// Key match with iOS: cluster representative = most-vibrant pixel in bucket (not average).
// Score = count * pow(rep.vibrancy, 1.8). Secondary fallback = 2nd most vibrant pixel
// in the primary cluster when no qualifying secondary cluster exists.

const EXTRACTION_SIZE = 160;
const MIN_SAT = 0.11;
const MIN_BRI = 0.16;
const MAX_BRI = 0.95;
const MIN_CLUSTER_SHARE = 0.03;
const MIN_CLUSTER_SHARE_SEC = 0.02;
const MIN_VIBRANCY_SEC = 0.18;
const HUE_BUCKET_SIZE = 0.065;
const MIN_HUE_DISTANCE = 0.10;

function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }

  return [h, max === 0 ? 0 : delta / max, max];
}

type Pixel = [number, number, number]; // [h, s, b]

type Cluster = {
  h: number;
  s: number;
  b: number;
  count: number;
  vibrancy: number;
  score: number;
  pixels: Pixel[];
};

export async function extractThemeSeedColors(imageUrl: string): Promise<RecipeThemeSeedColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = EXTRACTION_SIZE;
        canvas.height = EXTRACTION_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }

        ctx.drawImage(img, 0, 0, EXTRACTION_SIZE, EXTRACTION_SIZE);

        let pixelData: ImageData;
        try {
          pixelData = ctx.getImageData(0, 0, EXTRACTION_SIZE, EXTRACTION_SIZE);
        } catch {
          resolve(null);
          return;
        }

        // Extract valid pixels converted to HSB
        const pixels: Pixel[] = [];
        const data = pixelData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const [h, s, bri] = rgbToHsb(data[i], data[i + 1], data[i + 2]);
          if (s < MIN_SAT || bri < MIN_BRI || bri > MAX_BRI) continue;
          pixels.push([h, s, bri]);
        }

        if (pixels.length === 0) { resolve(null); return; }

        // Group into hue buckets — store all pixels individually (matches iOS)
        const buckets = new Map<number, Pixel[]>();
        for (const pixel of pixels) {
          const key = Math.floor(pixel[0] / HUE_BUCKET_SIZE);
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.push(pixel);
          } else {
            buckets.set(key, [pixel]);
          }
        }

        const total = pixels.length;
        const clusters: Cluster[] = [];

        for (const bucketPixels of buckets.values()) {
          if (bucketPixels.length < total * MIN_CLUSTER_SHARE) continue;

          // iOS clusterRep: pixel with max vibrancy (s*b) in the cluster
          let repH = 0, repS = 0, repB = 0, repVibrancy = -1;
          for (const [h, s, b] of bucketPixels) {
            const v = s * b;
            if (v > repVibrancy) {
              repH = h; repS = s; repB = b; repVibrancy = v;
            }
          }

          // iOS clusterScore: count * pow(rep.vibrancy, 1.8)
          const score = bucketPixels.length * Math.pow(repVibrancy, 1.8);
          clusters.push({ h: repH, s: repS, b: repB, count: bucketPixels.length, vibrancy: repVibrancy, score, pixels: bucketPixels });
        }

        if (clusters.length === 0) { resolve(null); return; }

        clusters.sort((a, z) => z.score - a.score);
        const primary = clusters[0];

        // Find a qualifying secondary cluster (different hue, enough vibrancy and count)
        let secondary: { h: number; s: number; b: number } | null = clusters.find((c) => {
          if (c === primary) return false;
          const hueDiff = Math.min(Math.abs(c.h - primary.h), 1 - Math.abs(c.h - primary.h));
          return hueDiff >= MIN_HUE_DISTANCE && c.vibrancy >= MIN_VIBRANCY_SEC && c.count >= total * MIN_CLUSTER_SHARE_SEC;
        }) ?? null;

        if (!secondary) {
          // iOS fallback: 2nd most vibrant pixel in the primary cluster
          const sorted = [...primary.pixels].sort((a, b) => (b[1] * b[2]) - (a[1] * a[2]));
          const pixel = sorted[1];
          secondary = pixel
            ? { h: pixel[0], s: pixel[1], b: pixel[2] }
            : { h: primary.h, s: primary.s, b: primary.b };
        }

        resolve({
          primaryH: primary.h,
          primaryS: primary.s,
          primaryB: primary.b,
          secondaryH: secondary.h,
          secondaryS: secondary.s,
          secondaryB: secondary.b,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
