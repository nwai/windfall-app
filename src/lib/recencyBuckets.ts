import type { Draw } from "../types";

export const RECENCY_BUCKET_COLORS = [
  "#0b1020", // prehistoric
  "#3a3a3a", // frozen
  "#244963", // permafrost
  "#2c75a0", // cold
  "#3ca0c7", // cool
  "#66c2a5", // temperate
  "#a6d854", // warm
  "#fdd835", // hot
  "#fb8c00", // tropical
  "#e53935", // volcanic
];

export const RECENCY_BUCKET_LABELS = [
  "prehistoric",
  "frozen",
  "permafrost",
  "cold",
  "cool",
  "temperate",
  "warm",
  "hot",
  "tropical",
  "volcanic",
];

// Map gap (draws since last appearance) to bucket index 0..9
export function mapGapToBucket(gap: number): number {
  if (gap === 0) return 9;      // volcanic (just drawn)
  if (gap === 1) return 8;      // tropical
  if (gap === 2) return 7;      // hot
  if (gap === 3) return 6;      // warm
  if (gap === 4) return 5;      // temperate
  if (gap <= 6) return 4;       // cool
  if (gap <= 8) return 3;       // cold
  if (gap <= 10) return 2;      // permafrost
  if (gap === 11) return 1;     // frozen
  return 0;                     // prehistoric (>=12 or never)
}

// Compute recency buckets for numbers 1..45 using history (oldest -> newest)
export function computeRecencyBuckets(history: Draw[]): { gaps: number[]; buckets: number[] } {
  const gaps = Array(45).fill(Number.POSITIVE_INFINITY);
  const buckets = Array(45).fill(0);

  // history is oldest -> newest
  for (let i = history.length - 1; i >= 0; i--) {
    const draw = history[i];
    const hits = new Set<number>([...(draw.main || []), ...(draw.supp || [])]);
    const distFromEnd = history.length - 1 - i; // 0 = latest draw
    hits.forEach((n) => {
      if (n >= 1 && n <= 45 && gaps[n - 1] === Number.POSITIVE_INFINITY) {
        gaps[n - 1] = distFromEnd;
      }
    });
  }

  for (let n = 1; n <= 45; n++) {
    const gap = gaps[n - 1];
    buckets[n - 1] = mapGapToBucket(Number.isFinite(gap) ? gap : 999);
  }

  return { gaps, buckets };
}
