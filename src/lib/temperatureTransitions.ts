/* Temperature transition matrix utilities
   NOTE: Replace computeNumberTemperatures with your real temperature logic
   (the same logic your Temperature Heatmap uses). This fallback version only
   marks "V" when a number hits; all other cases are "other".
*/

import { Draw } from "../types";

export type Temperature = "V" | "pR" | "pF" | "tT" | "F" | ">C" | "<C" | ">C" | "W" | "H" | "tT" | "tR" | "other";

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
 * Fallback temperature computer.
 * Replace with your actual Temperature Heatmap classifier so you get pR, pF, tT, F, C, <C, etc.
 */
export function computeNumberTemperatures(history: Draw[]): Record<number, Temperature[]> {
  const temps: Record<number, Temperature[]> = {};
  for (let n = 1; n <= 45; n++) temps[n] = [];

  for (let i = 0; i < history.length; i++) {
    const draw = history[i];
    const hitSet = new Set<number>([...draw.main, ...draw.supp]);
    for (let n = 1; n <= 45; n++) {
      const isHit = hitSet.has(n);
      // Minimal fallback: mark "V" if hit, otherwise "other".
      temps[n].push(isHit ? "V" : "other");
    }
  }
  return temps;
}

/**
 * Build per-number transition matrix:
 * P(V next | previous temperature T) estimated from counts in the window.
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

/** Convenience: probability for all numbers given their latest temp */
export function getAllProbabilitiesForLatestTemps(
  matrix: TransitionMatrix,
  latestTemps: Record<number, Temperature>
): number[] {
  const arr: number[] = [];
  for (let n = 1; n <= 45; n++) {
    const t = latestTemps[n] ?? "other";
    arr.push(getTransitionProbability(matrix, n, t));
  }
  return arr;
}