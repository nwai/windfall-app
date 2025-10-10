import { Draw } from "../types";

interface TempSignalOptions {
  alpha?: number;
  hybridWeight?: number;           // weight on EMA in hybrid
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;          // pin hits to 1.0
  metric?: "ema" | "recency" | "hybrid";
  heightNumbers?: number;
}

/**
 * Returns an array length=heightNumbers with the latest (most recent draw) value
 * for the chosen metric (ema | recency | hybrid) consistent with TemperatureHeatmap.
 */
export function computeTemperatureSignal(
  historyRaw: Draw[],
  {
    alpha = 0.2,
    hybridWeight = 0.5,
    emaNormalize = "per-number",
    enforcePeaks = true,
    metric = "hybrid",
    heightNumbers = 45,
  }: TempSignalOptions = {}
): number[] {
  if (!historyRaw.length) return Array(heightNumbers).fill(0);

  // Ensure chronological oldest → newest
  const first = new Date(historyRaw[0].date).getTime();
  const last = new Date(historyRaw[historyRaw.length - 1].date).getTime();
  const newestFirst = historyRaw.length > 1 && first > last;
  const history = newestFirst ? historyRaw.slice().reverse() : historyRaw.slice();
  const T = history.length;

  // Occurrence + raw EMA
  const occur: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  const ema: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  {
    const prev: number[] = Array(heightNumbers).fill(0);
    for (let t = 0; t < T; t++) {
      const present = new Set<number>([...(history[t].main || []), ...(history[t].supp || [])]);
      for (let n = 1; n <= heightNumbers; n++) {
        const o = present.has(n) ? 1 : 0;
        occur[n - 1][t] = o;
        const cur = alpha * o + (1 - alpha) * prev[n - 1];
        ema[n - 1][t] = cur;
        prev[n - 1] = cur;
      }
    }
  }

  // Recency (1 right after hit, decays 0→ with drought)
  const recency: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  {
    for (let n = 0; n < heightNumbers; n++) {
      let age = T;
      for (let t = 0; t < T; t++) {
        if (occur[n][t] === 1) age = 0; else age = Math.min(T, age + 1);
        const normAge = T > 1 ? Math.min(1, age / (T - 1)) : 1;
        recency[n][t] = 1 - normAge;
      }
    }
  }

  // Normalize EMA
  const emaNorm: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  if (emaNormalize === "per-number") {
    for (let n = 0; n < heightNumbers; n++) {
      let mn = Number.POSITIVE_INFINITY, mx = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < T; t++) {
        const v = ema[n][t]; if (v < mn) mn = v; if (v > mx) mx = v;
      }
      const denom = (mx - mn) || 1;
      for (let t = 0; t < T; t++) emaNorm[n][t] = (ema[n][t] - mn) / denom;
    }
  } else {
    let mn = Number.POSITIVE_INFINITY, mx = Number.NEGATIVE_INFINITY;
    for (let n = 0; n < heightNumbers; n++)
      for (let t = 0; t < T; t++) {
        const v = ema[n][t]; if (v < mn) mn = v; if (v > mx) mx = v;
      }
    const denom = (mx - mn) || 1;
    for (let n = 0; n < heightNumbers; n++)
      for (let t = 0; t < T; t++)
        emaNorm[n][t] = (ema[n][t] - mn) / denom;
  }

  const w = Math.max(0, Math.min(1, hybridWeight));
  const latest: number[] = Array(heightNumbers).fill(0);

  for (let n = 0; n < heightNumbers; n++) {
    const lastIdx = T - 1;
    let val: number;
    if (metric === "ema") val = emaNorm[n][lastIdx];
    else if (metric === "recency") val = recency[n][lastIdx];
    else {
      val = w * emaNorm[n][lastIdx] + (1 - w) * recency[n][lastIdx];
      if (enforcePeaks && occur[n][lastIdx] === 1) val = 1;
    }
    latest[n] = val;
  }
  return latest;
}