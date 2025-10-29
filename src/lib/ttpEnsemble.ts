import { Draw } from "../types";
import { TemperatureClassifierOptions, computeTemperatureCategories, Temperature } from "./temperatureCategories";
import { buildTransitionMatrix, getTransitionProbability } from "./temperatureTransitions";
import { backtestTemperatureTransitionsTopK, BacktestSummary } from "./backtestTemperatureTransitions";

/**
 * Compute per-number probabilities by blending multiple window sizes.
 * weightsMode:
 *  - "equal": equal weights
 *  - "performance": weight by recent meanF1 from backtesting each window
 */
export type EnsembleWeightsMode = "equal" | "performance";

export interface EnsembleOptions {
  windowSizes?: number[];           // default [9, 25, 50]
  weightsMode?: EnsembleWeightsMode; // default "equal"
  topKForScoring?: number;          // for performance weighting; default 8
  classifierOptions?: TemperatureClassifierOptions;
}

export function computeEnsembleProbabilities(
  history: Draw[],
  options: EnsembleOptions = {}
): Array<{ n: number; p: number; details: Array<{ w: number; p: number; window: number }> }> {
  const {
    windowSizes = [9, 25, 50],
    weightsMode = "equal",
    topKForScoring = 8,
    classifierOptions = {},
  } = options;

  const probsPerWindow: Array<{ window: number; probs: number[]; weight: number }> = [];

  // Precompute weights (equal or performance-weighted by recent meanF1)
  let perfWeights: number[] | null = null;
  if (weightsMode === "performance") {
    const weights: number[] = [];
    for (const w0 of windowSizes) {
      const w = Math.max(3, Math.min(w0, history.length - 1));
      if (w < 3 || w >= history.length) { weights.push(0); continue; }
      const summary: BacktestSummary =
        backtestTemperatureTransitionsTopK(history, w, topKForScoring, classifierOptions);
      weights.push(summary.meanF1 || 0);
    }
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    perfWeights = weights.map(x => x / sum);
  }

  for (let i = 0; i < windowSizes.length; i++) {
    const w0 = windowSizes[i];
    const w = Math.max(3, Math.min(w0, history.length));
    const slice = history.slice(-w);
    if (slice.length < 2) continue;

    const categories: Record<number, Temperature[]> = computeTemperatureCategories(slice, classifierOptions);
    const matrix = buildTransitionMatrix(slice, categories);

    const latest: Record<number, Temperature> = {};
    for (let n = 1; n <= (classifierOptions.heightNumbers ?? 45); n++) {
      const arr = categories[n] || [];
      latest[n] = arr[arr.length - 1] ?? "other";
    }

    const probs: number[] = [];
    for (let n = 1; n <= (classifierOptions.heightNumbers ?? 45); n++) {
      probs.push(getTransitionProbability(matrix, n, latest[n]));
    }

    const weight = perfWeights ? perfWeights[i] ?? 0 : 1 / windowSizes.length;
    probsPerWindow.push({ window: w0, probs, weight });
  }

  // Blend
  const out: Array<{ n: number; p: number; details: Array<{ w: number; p: number; window: number }> }> = [];
  const N = classifierOptions.heightNumbers ?? 45;
  for (let n = 1; n <= N; n++) {
    let p = 0;
    const details: Array<{ w: number; p: number; window: number }> = [];
    for (const row of probsPerWindow) {
      const pn = row.probs[n - 1] ?? 0;
      p += row.weight * pn;
      details.push({ w: row.weight, p: pn, window: row.window });
    }
    out.push({ n, p, details });
  }
  return out.sort((a, b) => b.p - a.p || a.n - b.n);
}