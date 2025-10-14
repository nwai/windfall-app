import { Draw } from "../types";
import {
  buildTransitionMatrix,
  getTransitionProbability,
} from "./temperatureTransitions";
import {
  computeTemperatureCategories,
  Temperature,
  TemperatureClassifierOptions,
} from "./temperatureCategories";

export interface BacktestWindowResult {
  windowStart: number;   // index into history
  windowEnd: number;     // inclusive index into history
  nextIndex: number;     // index of the evaluated next draw
  accuracy: number;      // (TP + TN) / total
  precision: number;     // TP / (TP + FP)
  recall: number;        // TP / (TP + FN)
  threshold: number;
  positivesPredicted: number;
  positivesActual: number;
}

export interface BacktestSummary {
  windows: BacktestWindowResult[];
  meanAccuracy: number;
  meanPrecision: number;
  meanRecall: number;
}

/**
 * Backtest sliding windows of size windowSize across history.
 * Uses computeTemperatureCategories with the same options you pass the heatmap/panel,
 * builds a transition matrix for each window, and predicts hits in the next draw
 * using a probability threshold on P(V | currentTemp).
 */
export function backtestTemperatureTransitions(
  history: Draw[],
  windowSize: number,
  threshold: number = 0.5,
  classifierOptions: TemperatureClassifierOptions = {}
): BacktestSummary {
  const windows: BacktestWindowResult[] = [];
  if (history.length <= windowSize) {
    return { windows, meanAccuracy: 0, meanPrecision: 0, meanRecall: 0 };
  }

  for (let start = 0; start <= history.length - windowSize - 1; start++) {
    const end = start + windowSize - 1;
    const nextIdx = end + 1;

    const win = history.slice(start, start + windowSize);
    const nextDraw = history[nextIdx];

    const cats = computeTemperatureCategories(win, classifierOptions);
    const matrix = buildTransitionMatrix(win, cats);

    // latest category in the window for each number
    const latestCat: Record<number, Temperature> = {};
    for (let n = 1; n <= (classifierOptions.heightNumbers ?? 45); n++) {
      const arr = cats[n] || [];
      latestCat[n] = arr[arr.length - 1] ?? "other";
    }

    let TP = 0, FP = 0, TN = 0, FN = 0;
    let positivesPredicted = 0;
    let positivesActual = 0;

    for (let n = 1; n <= (classifierOptions.heightNumbers ?? 45); n++) {
      const p = getTransitionProbability(matrix, n, latestCat[n]);
      const predictHit = p >= threshold;
      const actualHit = nextDraw.main.includes(n) || nextDraw.supp.includes(n);

      if (predictHit) positivesPredicted++;
      if (actualHit) positivesActual++;

      if (predictHit && actualHit) TP++;
      else if (predictHit && !actualHit) FP++;
      else if (!predictHit && actualHit) FN++;
      else TN++;
    }

    const total = TP + FP + TN + FN || 1;
    const accuracy = (TP + TN) / total;
    const precision = TP + FP === 0 ? 0 : TP / (TP + FP);
    const recall = TP + FN === 0 ? 0 : TP / (TP + FN);

    windows.push({
      windowStart: start,
      windowEnd: end,
      nextIndex: nextIdx,
      accuracy,
      precision,
      recall,
      threshold,
      positivesPredicted,
      positivesActual,
    });
  }

  const mean = (k: keyof BacktestWindowResult) =>
    windows.length ? windows.reduce((s, w) => s + (w[k] as number), 0) / windows.length : 0;

  return {
    windows,
    meanAccuracy: mean("accuracy"),
    meanPrecision: mean("precision"),
    meanRecall: mean("recall"),
  };
}