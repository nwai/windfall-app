// Diagnostic: compare drought-hazard, temperature-signal and DGA diamond predictions
// Enhanced: reports diamonds per radius and tries two predCol modes
// Usage (from App context): import { comparePredictions } from "./debug/comparePredictions";
// const report = comparePredictions(filteredHistory, { topK: 12, dgaMaxRadius: 6 });
// console.log(JSON.stringify(report, null, 2));

import { Draw } from "../types";
import { computeDroughtHazard } from "../lib/droughtHazard";
import { computeTemperatureSignal } from "../lib/temperatureSignal";
import { buildDrawGrid, findDiamondsAllRadii, getPredictedNumbers } from "../dga";

export type CompareOptions = {
  topK?: number;            // how many to report per list (clamped to 1..45)
  dgaMaxRadius?: number;    // max radius to use for diamonds (bounded by grid)
  preferAppendedNext?: boolean; // choose appended next column vs last real column for dgaTop
};

export function comparePredictions(history: Draw[], opts: CompareOptions = {}) {
  const topK = Math.max(1, Math.min(45, opts.topK ?? 12));
  const dgaMaxRadius = Math.max(1, opts.dgaMaxRadius ?? 4);
  const preferAppendedNext = !!opts.preferAppendedNext;

  if (!history || history.length === 0) return { error: "no history" };

  // 1) hazard table
  const { byNumber } = computeDroughtHazard(history); // returns { number, k, p } per number
  const hazardSorted = byNumber.slice().sort((a, b) => b.p - a.p || b.k - a.k);
  const hazardTop = hazardSorted.slice(0, topK).map((r) => ({ number: r.number, k: r.k, p: r.p }));

  // 2) temperature signal ranking
  const tempSignal = computeTemperatureSignal(history, {
    alpha: 0.25,
    hybridWeight: 0.6,
    emaNormalize: "per-number",
    enforcePeaks: true,
    metric: "hybrid",
    heightNumbers: 45,
  });
  const tempList = tempSignal.map((s, i) => ({ number: i + 1, score: s ?? 0 })).sort((a, b) => b.score - a.score || a.number - b.number);
  const tempTop = tempList.slice(0, topK);

  // 3) DGA diamond diagnostics (two modes)
  const draws = history.length;
  const baseGrid = buildDrawGrid(history, 45, draws);

  function runDiamondScan(grid: number[][], predCol: number, maxRadius: number) {
    const nRows = grid.length;
    const nCols = grid[0]?.length || 1;
    const effectiveMax = Math.max(1, Math.min(maxRadius, Math.floor(Math.min(nRows, nCols) / 2)));
    const diamonds = findDiamondsAllRadii(grid, 1, effectiveMax);
    const predicted = getPredictedNumbers(diamonds, predCol);

    const perRadius: Record<number, number> = {};
    for (let r = 1; r <= effectiveMax; r++) {
      const ds = findDiamondsAllRadii(grid, r, r);
      perRadius[r] = ds.length;
    }
    return { diamonds, predicted, perRadius, effectiveMax };
  }

  // Mode A: appended empty next column
  const gridAppended = baseGrid.map((row) => [...row, 0]);
  const predColAppended = (gridAppended[0]?.length || 1) - 1;
  const resAppended = runDiamondScan(gridAppended, predColAppended, dgaMaxRadius);

  // Mode B: last real column (no appended)
  const predColLastReal = (baseGrid[0]?.length || 1) - 1;
  const resLastReal = runDiamondScan(baseGrid, predColLastReal, dgaMaxRadius);

  const preds = [
    { mode: "appendedNext", predCol: predColAppended, predicted: resAppended.predicted, diamondsCount: resAppended.diamonds.length, diamondsPerRadius: resAppended.perRadius },
    { mode: "lastRealCol", predCol: predColLastReal, predicted: resLastReal.predicted, diamondsCount: resLastReal.diamonds.length, diamondsPerRadius: resLastReal.perRadius },
  ];

  const chosen = preferAppendedNext ? preds[0] : preds[1];
  const dgaTop = chosen.predicted.slice(0, topK);

  // 4) per-number table with DGA flags
  const perNumber = byNumber.map((r) => {
    const num = r.number;
    const temp = tempList.find((t) => t.number === num)?.score ?? 0;
    return {
      number: num,
      droughtK: r.k,
      hazardP: r.p,
      tempScore: temp,
      dgaPredictedAny: preds.some((p) => p.predicted.includes(num)),
      dgaPredictedAppendedNext: preds[0].predicted.includes(num),
      dgaPredictedLastRealCol: preds[1].predicted.includes(num),
    };
  }).sort((a, b) => a.number - b.number);

  return {
    topK,
    hazardTop,
    tempTop,
    dgaTop,
    dgaDiagnostics: { modes: preds },
    perNumber,
  };
}