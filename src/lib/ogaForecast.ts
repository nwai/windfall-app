import type { Draw } from "../types";
import { computeOGA, DEFAULT_OGA_SPOKES } from "../utils/oga";

export interface OGAForecast {
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  bands: { low: number; mid: number; high: number };
  scores: number[];
  deciles?: { thresholds: number[]; probs: number[] };
}

function gaussianKDE(samples: number[]): { pdf: (x: number) => number } {
  const n = samples.length;
  if (n === 0) return { pdf: () => 0 };
  const mean = samples.reduce((s, x) => s + x, 0) / n;
  const variance = samples.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n;
  const std = Math.sqrt(Math.max(variance, 1e-12));
  // Scott's rule of thumb for bandwidth
  const h = 1.06 * std * Math.pow(n, -1 / 5);
  const invH = 1 / h;
  const norm = invH / Math.sqrt(2 * Math.PI) / n;
  return {
    pdf: (x: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const u = (x - samples[i]) * invH;
        sum += Math.exp(-0.5 * u * u);
      }
      return norm * sum;
    },
  };
}

function empiricalQuantiles(samples: number[], ps: number[]): number[] {
  if (samples.length === 0) return ps.map(() => 0);
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  return ps.map(p => {
    const idx = Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));
    return sorted[idx];
  });
}

function integratePDF(pdf: (x: number) => number, a: number, b: number, steps = 256): number {
  if (a === b) return 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const h = (hi - lo) / steps;
  let area = 0;
  // Simpson’s rule (composite)
  for (let i = 0; i <= steps; i++) {
    const x = lo + i * h;
    const w = (i === 0 || i === steps) ? 1 : (i % 2 === 0 ? 2 : 4);
    area += w * pdf(x);
  }
  return area * h / 3;
}

/**
 * Estimate the next draw's OGA distribution from the given history.
 * baseline: draws used to compute OGA per draw (window or all).
 * Returns mean, percentiles, and KDE-derived band probabilities (≤p10, p10–p90, ≥p90).
 */
export function forecastOGA(history: Draw[], baseline?: Draw[], spokeCount: number = DEFAULT_OGA_SPOKES): OGAForecast {
  const base = baseline && baseline.length ? baseline : history;
  const scores: number[] = history.map(d => computeOGA([...d.main, ...d.supp], base, spokeCount));
  const n = scores.length;
  if (n === 0) {
    return { n: 0, mean: 0, p10: 0, p50: 0, p90: 0, bands: { low: 0, mid: 0, high: 0 }, scores: [] };
  }
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const [p10, p50, p90] = empiricalQuantiles(scores, [0.10, 0.50, 0.90]);
  const kde = gaussianKDE(scores);
  // Integrate KDE over bands
  const lowProb = integratePDF(kde.pdf, Math.min(...scores) - 4, p10);
  const midProb = integratePDF(kde.pdf, p10, p90);
  const highProb = integratePDF(kde.pdf, p90, Math.max(...scores) + 4);
  const totalBands = lowProb + midProb + highProb;
  const bands = totalBands > 1e-9 ? { low: lowProb / totalBands, mid: midProb / totalBands, high: highProb / totalBands } : { low: 0, mid: 0, high: 0 };

  // Deciles: 10 bins by percentiles at 10%..90%
  const qs = empiricalQuantiles(scores, [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]);
  const lo = Math.min(...scores) - 4;
  const hi = Math.max(...scores) + 4;
  const bounds = [lo, ...qs, hi]; // 11 bounds, 10 bins
  const rawProbs: number[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    rawProbs.push(integratePDF(kde.pdf, bounds[i], bounds[i+1]));
  }
  const totalDec = rawProbs.reduce((s,x)=>s+x,0);
  const decProbs = totalDec > 1e-9 ? rawProbs.map(p => p / totalDec) : Array(10).fill(0);
  return { n, mean, p10, p50, p90, bands, scores, deciles: { thresholds: qs, probs: decProbs } };
}
