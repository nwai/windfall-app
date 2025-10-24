import { Draw } from "../types";
import { Temperature } from "./temperatureCategories";

export interface TransitionCountsWeighted {
  hit: number;   // weighted sum of hits
  total: number; // weighted sum of opportunities
}
export interface TransitionMatrixWeighted {
  [n: number]: {
    [prevTemp: string]: TransitionCountsWeighted;
  };
}

/**
 * Build a transition matrix with exponential decay weighting.
 * halfLife: in draws. Each step older is worth 0.5^(age/halfLife).
 * Weights are applied relative to the most recent draw in the provided history slice.
 */
export function buildTransitionMatrixDecay(
  history: Draw[],
  numberTemperatures: Record<number, Temperature[]>,
  halfLife: number = 9
): TransitionMatrixWeighted {
  const matrix: TransitionMatrixWeighted = {};
  const nDraws = history.length;
  if (nDraws < 2) return matrix;

  const endIdx = nDraws - 1; // last index is current reference
  const N = Math.max(45, ...Object.keys(numberTemperatures).map((k) => Number(k) || 0));
  const decay = (age: number) => Math.pow(0.5, age / Math.max(1e-9, halfLife));

  for (let n = 1; n <= N; ++n) {
    matrix[n] = {};
    const temps = numberTemperatures[n] || [];
    for (let i = 1; i < nDraws; ++i) {
      const prevTemp = temps[i - 1] ?? "other";
      const wasHit = history[i].main.includes(n) || history[i].supp.includes(n);
      const age = endIdx - i; // 0 for last-observation, larger for older
      const w = decay(age);

      if (!matrix[n][prevTemp]) matrix[n][prevTemp] = { hit: 0, total: 0 };
      matrix[n][prevTemp].total += w;
      if (wasHit) matrix[n][prevTemp].hit += w;
    }
  }
  return matrix;
}

export function getTransitionProbabilityWeighted(
  matrix: TransitionMatrixWeighted,
  n: number,
  prevTemp: string
): number {
  const entry = matrix[n]?.[prevTemp];
  if (!entry || entry.total === 0) return 0;
  return entry.hit / entry.total;
}