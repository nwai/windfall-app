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
  f1: number;            // 2*prec*rec/(prec+rec) (0 when both 0)
  threshold: number;     // for threshold mode; in topK mode this mirrors 0 and is unused
  positivesPredicted: number;
  positivesActual: number;
}

export interface BacktestSummary {
  windows: BacktestWindowResult[];
  meanAccuracy: number;
  meanPrecision: number;
  meanRecall: number;
  meanF1: number;
}

/**
 * Legacy/compat wrapper: threshold-based backtest (kept for backward compatibility).
 */
export function backtestTemperatureTransitions(
  history: Draw[],
  windowSize: number,
  threshold: number = 0.5,
  classifierOptions: TemperatureClassifierOptions = {}
): BacktestSummary {
  return backtestTemperatureTransitionsThreshold(history, windowSize, threshold, classifierOptions);
}

/**
 * Threshold mode: predict "hit" if P(V | currentTemp) >= threshold.
 * Honors small windows; caller should ensure windowSize <= history.length - 1.
 */
export function backtestTemperatureTransitionsThreshold(
  history: Draw[],
  windowSize: number,
  threshold: number = 0.5,
  classifierOptions: TemperatureClassifierOptions = {}
): BacktestSummary {
  const windows: BacktestWindowResult[] = [];
  if (history.length <= windowSize) {
    return { windows, meanAccuracy: 0, meanPrecision: 0, meanRecall: 0, meanF1: 0 };
  }

  const heightNumbers = classifierOptions.heightNumbers ?? 45;

  for (let start = 0; start <= history.length - windowSize - 1; start++) {
    const end = start + windowSize - 1;
    const nextIdx = end + 1;

    const win = history.slice(start, start + windowSize);
    const nextDraw = history[nextIdx];

    const cats = computeTemperatureCategories(win, classifierOptions);
    const matrix = buildTransitionMatrix(win, cats);

    const latestCat: Record<number, Temperature> = {};
    for (let n = 1; n <= heightNumbers; n++) {
      const arr = cats[n] || [];
      latestCat[n] = arr[arr.length - 1] ?? "other";
    }

    let TP = 0, FP = 0, TN = 0, FN = 0;
    let positivesPredicted = 0;
    let positivesActual = 0;

    for (let n = 1; n <= heightNumbers; n++) {
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
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    windows.push({
      windowStart: start,
      windowEnd: end,
      nextIndex: nextIdx,
      accuracy,
      precision,
      recall,
      f1,
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
    meanF1: mean("f1"),
  };
}

/**
 * Top-K mode: predict the top K numbers by P(V | currentTemp).
 * Honors small windows; caller ensures windowSize <= history.length - 1.
 */
export function backtestTemperatureTransitionsTopK(
  history: Draw[],
  windowSize: number,
  topK: number = 8,
  classifierOptions: TemperatureClassifierOptions = {}
): BacktestSummary {
  const windows: BacktestWindowResult[] = [];
  if (history.length <= windowSize) {
    return { windows, meanAccuracy: 0, meanPrecision: 0, meanRecall: 0, meanF1: 0 };
  }

  const heightNumbers = classifierOptions.heightNumbers ?? 45;
  const K = Math.max(1, Math.min(topK, heightNumbers));

  for (let start = 0; start <= history.length - windowSize - 1; start++) {
    const end = start + windowSize - 1;
    const nextIdx = end + 1;

    const win = history.slice(start, start + windowSize);
    const nextDraw = history[nextIdx];

    const cats = computeTemperatureCategories(win, classifierOptions);
    const matrix = buildTransitionMatrix(win, cats);

    const probs: Array<{ n: number; p: number }> = [];
    for (let n = 1; n <= heightNumbers; n++) {
      const arr = cats[n] || [];
      const temp = arr[arr.length - 1] ?? "other";
      const p = getTransitionProbability(matrix, n, temp);
      probs.push({ n, p });
    }
    probs.sort((a, b) => b.p - a.p || a.n - b.n);

    const selected = new Set<number>(probs.slice(0, K).map((r) => r.n));

    let TP = 0, FP = 0, TN = 0, FN = 0;
    let positivesPredicted = K;
    let positivesActual = 0;

    for (let n = 1; n <= heightNumbers; n++) {
      const predictHit = selected.has(n);
      const actualHit = nextDraw.main.includes(n) || nextDraw.supp.includes(n);
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
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    windows.push({
      windowStart: start,
      windowEnd: end,
      nextIndex: nextIdx,
      accuracy,
      precision,
      recall,
      f1,
      threshold: 0, // unused in topK mode
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
    meanF1: mean("f1"),
  };
}