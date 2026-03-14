import type { Draw } from "../types";
import { runWalkForwardBacktest, BacktestResult, PredictorFn } from "./backtest";

export interface AutoTuneConfig {
  windowSize: number;
  mode: "heuristic" | "calibrated";
}

export interface AutoTuneResult extends AutoTuneConfig {
  result: BacktestResult;
}

export interface AutoTuneOutput {
  /** All sweep results sorted by deltaMean descending (best first) */
  results: AutoTuneResult[];
  /** Best configuration found */
  best: AutoTuneResult;
  /** Number of configurations evaluated */
  totalEvaluated: number;
}

export interface AutoTuneOptions {
  /** Window sizes to sweep. Defaults to range from 20 to half the history in steps of ~10. */
  windowSizes?: number[];
  /** Modes to evaluate */
  modes?: Array<"heuristic" | "calibrated">;
  /** Random trials per draw for the backtest baseline */
  randomTrials?: number;
  /** Bootstrap iterations for CI computation */
  bootstrapIters?: number;
  /** Seed for reproducibility */
  seed?: number;
  /** Callback for progress reporting. Called with (completed, total). */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Build default window sizes: from 20 to floor(history.length * 0.8) in steps of ~10,
 * capped so we always leave at least 10 draws for evaluation.
 */
function defaultWindowSizes(historyLength: number): number[] {
  const maxWindow = Math.floor(historyLength * 0.8);
  const minWindow = Math.min(20, maxWindow);
  const sizes: number[] = [];
  for (let w = minWindow; w <= maxWindow; w += 10) {
    sizes.push(w);
  }
  // Ensure the max is included
  if (sizes.length && sizes[sizes.length - 1] !== maxWindow) {
    sizes.push(maxWindow);
  }
  return sizes;
}

/**
 * Sweep window sizes × modes to find the configuration that maximises deltaMean
 * (the margin by which the method beats the random baseline).
 */
export function autoTuneBacktest(
  history: Draw[],
  predictorFactory: (mode: "heuristic" | "calibrated") => PredictorFn,
  options: AutoTuneOptions = {}
): AutoTuneOutput {
  const {
    windowSizes = defaultWindowSizes(history.length),
    modes = ["heuristic", "calibrated"],
    randomTrials = 100,
    bootstrapIters = 200,
    seed = 42,
    onProgress,
  } = options;

  const results: AutoTuneResult[] = [];
  const total = windowSizes.length * modes.length;
  let completed = 0;

  for (const mode of modes) {
    const predictor = predictorFactory(mode);
    for (const windowSize of windowSizes) {
      if (windowSize >= history.length) continue;

      const result = runWalkForwardBacktest(
        history,
        windowSize,
        predictor,
        randomTrials,
        bootstrapIters,
        seed
      );

      results.push({ windowSize, mode, result });
      completed++;
      onProgress?.(completed, total);
    }
  }

  // Sort by deltaMean descending — higher is better (method excludes fewer winners than random)
  results.sort((a, b) => b.result.deltaMean - a.result.deltaMean);

  return {
    results,
    best: results[0],
    totalEvaluated: results.length,
  };
}
