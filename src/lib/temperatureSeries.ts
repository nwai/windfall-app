import { Draw } from "../types";

export type Metric = "ema" | "recency" | "hybrid";
export type EmaNormalize = "global" | "per-number";

export interface TemperatureOptions {
  alpha?: number;                // EMA smoothing
  heightNumbers?: number;        // default 45
  metric?: Metric;               // default "hybrid"
  hybridWeight?: number;         // EMA weight in hybrid (0..1), default 0.5
  emaNormalize?: EmaNormalize;   // default "global"
  enforcePeaks?: boolean;        // pin hits to 1.0, default true
  buckets?: number;              // default 10
  bucketStops?: number[];        // optional fixed thresholds in (0..1), length=buckets-1
}

function toChronological(history: Draw[]) {
  if (history.length <= 1) return history.slice();
  const first = new Date(history[0].date).getTime();
  const last = new Date(history[history.length - 1].date).getTime();
  const newestFirst = history.length > 1 && first > last;
  return newestFirst ? history.slice().reverse() : history.slice();
}

export function computeTemperatureAndBuckets(historyRaw: Draw[], opts: TemperatureOptions = {}) {
  const {
    alpha = 0.2,
    heightNumbers = 45,
    metric = "hybrid",
    hybridWeight = 0.5,
    emaNormalize = "global",
    enforcePeaks = true,
    buckets = 10,
    bucketStops,
  } = opts;

  const history = toChronological(historyRaw);
  const T = history.length;

  // Occurrence and EMA
  const occurSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  const emaSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  {
    const prev: number[] = Array(heightNumbers).fill(0);
    for (let t = 0; t < T; t++) {
      const present = new Set<number>([...(history[t]?.main || []), ...(history[t]?.supp || [])]);
      for (let n = 1; n <= heightNumbers; n++) {
        const o = present.has(n) ? 1 : 0;
        occurSeries[n - 1][t] = o;
        const cur = alpha * o + (1 - alpha) * prev[n - 1];
        emaSeries[n - 1][t] = cur;
        prev[n - 1] = cur;
      }
    }
  }

  // Recency 1→0 with drought
  const recencySeries: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  {
    for (let n = 0; n < heightNumbers; n++) {
      let age = T;
      for (let t = 0; t < T; t++) {
        if (occurSeries[n][t] === 1) age = 0;
        else age = Math.min(T, age + 1);
        const normAge = T > 1 ? Math.min(1, age / (T - 1)) : 1;
        recencySeries[n][t] = 1 - normAge;
      }
    }
  }

  // EMA normalization
  const emaNorm: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  if (emaNormalize === "per-number") {
    for (let n = 0; n < heightNumbers; n++) {
      let minV = Number.POSITIVE_INFINITY, maxV = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < T; t++) {
        const v = emaSeries[n][t];
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      const denom = (maxV - minV) || 1;
      for (let t = 0; t < T; t++) emaNorm[n][t] = (emaSeries[n][t] - minV) / denom;
    }
  } else {
    let minV = Number.POSITIVE_INFINITY, maxV = Number.NEGATIVE_INFINITY;
    for (let n = 0; n < heightNumbers; n++) for (let t = 0; t < T; t++) {
      const v = emaSeries[n][t]; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const denom = (maxV - minV) || 1;
    for (let n = 0; n < heightNumbers; n++) for (let t = 0; t < T; t++) {
      emaNorm[n][t] = (emaSeries[n][t] - minV) / denom;
    }
  }

  // Combined value
  const w = Math.max(0, Math.min(1, hybridWeight));
  const valueSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  for (let n = 0; n < heightNumbers; n++) {
    for (let t = 0; t < T; t++) {
      let v = 0;
      if (metric === "ema") v = emaNorm[n][t];
      else if (metric === "recency") v = recencySeries[n][t];
      else v = w * emaNorm[n][t] + (1 - w) * recencySeries[n][t];
      if (enforcePeaks && occurSeries[n][t] === 1) v = 1;
      valueSeries[n][t] = v;
    }
  }

  // Buckets
  let stops: number[] = [];
  if (bucketStops && bucketStops.length === buckets - 1) {
    stops = bucketStops.slice();
  } else {
    // default uniform thresholds
    stops = Array.from({ length: buckets - 1 }, (_, i) => (i + 1) / buckets);
  }

  const bucketIndex: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
  function bIndex(v: number): number {
    for (let i = 0; i < stops.length; i++) if (v <= stops[i]) return i;
    return stops.length;
  }
  for (let n = 0; n < heightNumbers; n++) {
    for (let t = 0; t < T; t++) {
      bucketIndex[n][t] = bIndex(valueSeries[n][t]);
    }
  }

  // Transition counts and matrix across all numbers
  const transitionCounts: number[][] = Array.from({ length: buckets }, () => Array(buckets).fill(0));
  for (let n = 0; n < heightNumbers; n++) {
    for (let t = 0; t < T - 1; t++) {
      const i = bucketIndex[n][t];
      const j = bucketIndex[n][t + 1];
      transitionCounts[i][j] += 1;
    }
  }

  // Laplace-smoothed transition matrix
  const transitionMatrix: number[][] = transitionCounts.map((row) => {
    const smoothed = row.map((c) => c + 1);
    const sum = smoothed.reduce((a, b) => a + b, 0);
    return smoothed.map((c) => c / sum);
  });

  // Current bucket and next-bucket probabilities per number (based on current bucket)
  const currentBucketPerNumber: number[] = Array(heightNumbers).fill(0).map((_, i) => (T ? bucketIndex[i][T - 1] : 0));
  const nextBucketProbsPerNumber: number[][] = currentBucketPerNumber.map((bk) => transitionMatrix[bk]?.slice() || Array(buckets).fill(1 / buckets));

  return {
    occurSeries,
    emaSeries,
    recencySeries,
    valueSeries,
    bucketStops: stops,
    bucketIndex,
    transitionCounts,
    transitionMatrix,
    currentBucketPerNumber,
    nextBucketProbsPerNumber,
  };
}