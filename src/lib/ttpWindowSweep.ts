import { Draw } from "../types";
import { TemperatureClassifierOptions } from "./temperatureCategories";
import {
  backtestTemperatureTransitionsTopK,
  backtestTemperatureTransitionsThreshold,
  BacktestSummary,
} from "./backtestTemperatureTransitions";

export type WindowSweepMode = "topk" | "threshold";
export type SweepMetric = "meanF1" | "meanPrecision" | "meanRecall" | "meanAccuracy";

export interface WindowSweepResult {
  windowSize: number;
  summary: BacktestSummary;
}

export interface WindowSweepOutcome {
  runs: WindowSweepResult[];
  bestByMetric: { [M in SweepMetric]: { windowSize: number; value: number } };
}

/**
 * Sweep candidate window sizes and pick best by chosen metrics.
 * Defaults for Top-K mode (sensible for WW): K=8.
 * Only evaluates windows that have at least 1 next-draw to score.
 */
export function sweepWindows(
  history: Draw[],
  candidateWindows: number[] = [3, 5, 7, 9, 12, 15, 20, 25, 30, 40, 50],
  mode: WindowSweepMode = "topk",
  options: {
    topK?: number;
    threshold?: number;
    classifierOptions?: TemperatureClassifierOptions;
  } = {}
): WindowSweepOutcome {
  const runs: WindowSweepResult[] = [];
  const topK = options.topK ?? 8;
  const threshold = options.threshold ?? 0.5;
  const classifierOptions = options.classifierOptions ?? {};

  for (const w0 of candidateWindows) {
    const w = Math.max(3, Math.min(w0, history.length - 1));
    if (w < 3 || w >= history.length) continue;
    const summary =
      mode === "topk"
        ? backtestTemperatureTransitionsTopK(history, w, topK, classifierOptions)
        : backtestTemperatureTransitionsThreshold(history, w, threshold, classifierOptions);
    runs.push({ windowSize: w, summary });
  }

  const bestBy = (metric: SweepMetric) => {
    let best = { windowSize: 0, value: -Infinity };
    for (const r of runs) {
      const v = r.summary[metric];
      if (v > best.value) best = { windowSize: r.windowSize, value: v };
    }
    return best.windowSize ? best : { windowSize: 0, value: 0 };
  };

  return {
    runs,
    bestByMetric: {
      meanF1: bestBy("meanF1"),
      meanPrecision: bestBy("meanPrecision"),
      meanRecall: bestBy("meanRecall"),
      meanAccuracy: bestBy("meanAccuracy"),
    },
  };
}