import type { Draw } from "../types";
import { weightedSampleWithoutReplacement } from "./weightedSample";

export const MONTE_CARLO_MODEL_VERSION = "WF-MC-2";
export const MONTE_CARLO_PSEUDOCOUNT = 0.5;

export function monteCarloWeights(history: Draw[], excluded: readonly number[], trend?: Record<number, number> | null): number[] {
  const counts = Array<number>(45).fill(MONTE_CARLO_PSEUDOCOUNT);
  for (const draw of history.filter(d => !d.isSimulated)) {
    for (const n of new Set([...draw.main, ...draw.supp])) {
      if (Number.isInteger(n) && n >= 1 && n <= 45) counts[n - 1]++;
    }
  }
  const excludedSet = new Set(excluded);
  const weights = counts.map((count, i) => excludedSet.has(i + 1) ? 0 : count * (
    Number.isFinite(trend?.[i + 1]) && trend![i + 1] > 0 ? trend![i + 1] : 1
  ));
  const total = weights.reduce((sum, n) => sum + n, 0);
  return total > 0 ? weights.map(n => n / total) : weights;
}

export function simulateMonteCarlo(weights: number[], runs: number, size: number, rng: () => number): Map<number, number> {
  if (weights.length !== 45) throw new Error("Expected one sampling weight for each of the 45 numbers.");
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(size) || size < 1 || size > 45) throw new Error("Invalid simulation size or run count.");
  const numbers = weights.map((w, i) => ({ n: i + 1, w })).filter(row => Number.isFinite(row.w) && row.w > 0);
  if (numbers.length < size) throw new Error(`Need ${size} eligible numbers; only ${numbers.length} available. Review exclusions.`);
  const pool = numbers.map(row => row.n);
  const poolWeights = numbers.map(row => row.w);
  const counts = new Map<number, number>();
  for (let i = 0; i < runs; i++) {
    for (const n of weightedSampleWithoutReplacement(pool, poolWeights, size, rng)) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}
