import { Draw } from "../types";
import { computeTemperatureAndBuckets } from "./temperatureSeries";

// Unified temperature codes for transitions
export type Temperature =
  | "V"   // hit
  | "pR"  // trend up (previous rising)
  | "pF"  // trend down (previous falling)
  | "F"   // flat trend
  | "<C"  // colder side group
  | ">C"  // warmer-than-cool (temperate-ish)
  | "W"   // warm/hot
  | "H"   // hottest (volcanic)
  | "tT"  // tropical
  | "tR"  // trend reversal
  | "other";

export interface TemperatureClassifierOptions {
  // Must match TemperatureHeatmap props to stay in sync
  alpha?: number;
  heightNumbers?: number;               // default 45
  metric?: "ema" | "recency" | "hybrid";
  hybridWeight?: number;
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;

  buckets?: number;                     // usually 10
  bucketStops?: number[];               // same as your heatmap

  // Trend classification knobs
  lookback?: number;                    // default 4 draws
  threshold?: number;                   // default 0.02 normalized delta
  trendReversal?: boolean;              // default true
}

/**
 * Map a bucket index to one of H/tT/W/>C/<C.
 * If buckets = 10, uses: 9=H, 8=tT, 6..7=W, 5=>C, 0..4=<C.
 * For other bucket counts, generalizes proportionally.
 */
function bucketToCode(b: number, buckets: number): Temperature {
  if (buckets <= 1) return "<C";
  if (buckets === 10) {
    if (b >= 9) return "H";
    if (b === 8) return "tT";
    if (b >= 6) return "W";
    if (b === 5) return ">C";
    return "<C";
  }
  const last = buckets - 1;
  if (b === last) return "H";
  if (b === last - 1) return "tT";
  // Next ~20% as "W"
  const wStart = Math.max(0, Math.ceil(buckets * 0.6));
  const wEnd = Math.max(wStart, last - 2);
  if (b >= wStart && b <= wEnd) return "W";
  // Single band for >C just below W if available
  const gtC = Math.max(0, wStart - 1);
  if (b === gtC) return ">C";
  return "<C";
}

function sgn(x: number) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Compute per-number, per-draw temperature categories aligned with the heatmap config.
 * Priority:
 *   1) V  (hit on this draw)
 *   2) tR (trend reversal, optional) else pR/pF/F by valueSeries trend
 *   3) Bucket-derived code H/tT/W/>C/<C when trend is flat
 *   4) "F" or "other" fallback
 */
export function computeTemperatureCategories(
  history: Draw[],
  opts: TemperatureClassifierOptions = {}
): Record<number, Temperature[]> {
  const {
    alpha = 0.25,
    heightNumbers = 45,
    metric = "hybrid",
    hybridWeight = 0.6,
    emaNormalize = "per-number",
    enforcePeaks = true,
    buckets = 10,
    bucketStops,

    lookback = 4,
    threshold = 0.02,
    trendReversal = true,
  } = opts;

  const { occurSeries, valueSeries, bucketIndex } = computeTemperatureAndBuckets(history, {
    alpha,
    heightNumbers,
    metric,
    hybridWeight,
    emaNormalize,
    enforcePeaks,
    buckets,
    bucketStops,
  });

  const T = valueSeries[0]?.length ?? 0;
  const out: Record<number, Temperature[]> = {};
  for (let n = 1; n <= heightNumbers; n++) out[n] = [];

  for (let n = 1; n <= heightNumbers; n++) {
    const ni = n - 1;
    for (let t = 0; t < T; t++) {
      // 1) Hit -> "V"
      if (occurSeries[ni][t] === 1) {
        out[n].push("V");
        continue;
      }

      // 2) Trend classification by normalized delta over lookback
      const pastIdx = Math.max(0, t - lookback);
      const delta = valueSeries[ni][t] - valueSeries[ni][pastIdx];
      const dir = Math.abs(delta) >= threshold ? sgn(delta) : 0;

      if (trendReversal && t > 0) {
        const prevPastIdx = Math.max(0, (t - 1) - lookback);
        const prevDelta = valueSeries[ni][t - 1] - valueSeries[ni][prevPastIdx];
        const prevDir = Math.abs(prevDelta) >= threshold ? sgn(prevDelta) : 0;
        if (dir !== 0 && prevDir !== 0 && dir !== prevDir) {
          out[n].push("tR");
          continue;
        }
      }

      if (dir > 0) {
        out[n].push("pR");
        continue;
      } else if (dir < 0) {
        out[n].push("pF");
        continue;
      }

      // 3) Flat trend -> map by bucket class
      const b = bucketIndex[ni][t];
      if (b !== undefined && b !== null) {
        out[n].push(bucketToCode(b, buckets));
        continue;
      }

      // 4) Fallback
      out[n].push("F"); // or "other"
    }
  }

  return out;
}