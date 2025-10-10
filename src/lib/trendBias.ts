export type NumberTrend = {
  number: number;
  fortnight: number; // last 14 draws (count)
  month: number;     // last 30 draws (count)
};

export type TrendWeightingOptions =
  | {
      method?: "exp";
      beta?: number;          // default 3.0
    }
  | {
      method: "linear";
      slope?: number;         // default 0.5
      clampMin?: number;      // default 0.8
      clampMax?: number;      // default 1.2
    };

// Compute Δ 14→30 in percentage points (pp)
export function deltaPP(trend: NumberTrend): number {
  const r14 = trend.fortnight / 14;
  const r30 = trend.month / 30;
  return (r14 - r30) * 100; // percentage points
}

// Convert Δpp into a multiplier (weight)
export function weightFromDeltaPP(deltaPPValue: number, opts: TrendWeightingOptions = {}): number {
  const method = (opts as any).method ?? "exp";
  const deltaFrac = deltaPPValue / 100; // convert pp to fraction

  if (method === "linear") {
    const slope = (opts as any).slope ?? 0.5;
    const clampMin = (opts as any).clampMin ?? 0.8;
    const clampMax = (opts as any).clampMax ?? 1.2;
    const w = 1 + slope * deltaFrac;
    return Math.min(clampMax, Math.max(clampMin, w));
  }

  // exponential default
  const beta = (opts as any).beta ?? 3.0;
  return Math.exp(beta * deltaFrac);
}

// Build weights for every number using NumberTrends
export function buildTrendWeights(
  trends: NumberTrend[],
  opts?: TrendWeightingOptions
): Record<number, number> {
  const weights: Record<number, number> = {};
  for (const t of trends) {
    const dpp = deltaPP(t);
    weights[t.number] = weightFromDeltaPP(dpp, opts);
  }
  return weights;
}

// Normalize any map<number, score> into probabilities
export function normalizeScores(scores: Record<number, number>): Record<number, number> {
  let sum = 0;
  for (const n in scores) sum += Math.max(0, scores[n as any]);
  if (sum <= 0) return scores;
  const out: Record<number, number> = {};
  for (const n in scores) out[+n] = Math.max(0, scores[n as any]) / sum;
  return out;
}

// Apply weights to base scores/probabilities and re-normalize
export function applyTrendWeights(
  base: Record<number, number>,
  weights: Record<number, number>
): Record<number, number> {
  const scored: Record<number, number> = {};
  for (const n in base) {
    const key = +n;
    const w = weights[key] ?? 1;
    scored[key] = base[key] * w;
  }
  return normalizeScores(scored);
}