/* Transition matrix utilities built on top of temperature categories.
   This file now imports the Temperature type from temperatureCategories.
*/
import { Draw } from "../types";
import { Temperature, computeTemperatureCategories, TemperatureClassifierOptions } from "./temperatureCategories";

export interface TransitionCounts {
  hit: number;
  total: number;
}
export interface TransitionMatrix {
  [n: number]: {
    [prevTemp: string]: TransitionCounts;
  };
}

/**
 * Backward-compatible wrapper for legacy callers. Prefer computeTemperatureCategories directly.
 */
export function computeNumberTemperatures(
  history: Draw[],
  opts?: TemperatureClassifierOptions
): Record<number, Temperature[]> {
  return computeTemperatureCategories(history, opts);
}

/**
 * Build per-number transition matrix: counts of hit vs total by previous temperature code.
 */
export function buildTransitionMatrix(
  history: Draw[],
  numberTemperatures: Record<number, Temperature[]>
): TransitionMatrix {
  const matrix: TransitionMatrix = {};
  const nDraws = history.length;

  for (let n = 1; n <= 45; ++n) {
    matrix[n] = {};
    const temps = numberTemperatures[n] || [];
    for (let i = 1; i < nDraws; ++i) {
      const prevTemp = temps[i - 1] ?? "other";
      const wasHit = history[i].main.includes(n) || history[i].supp.includes(n);
      if (!matrix[n][prevTemp]) matrix[n][prevTemp] = { hit: 0, total: 0 };
      matrix[n][prevTemp].total += 1;
      if (wasHit) matrix[n][prevTemp].hit += 1;
    }
  }
  return matrix;
}

export function getTransitionProbability(
  matrix: TransitionMatrix,
  n: number,
  prevTemp: string
): number {
  const entry = matrix[n]?.[prevTemp];
  if (!entry || entry.total === 0) return 0;
  return entry.hit / entry.total;
}