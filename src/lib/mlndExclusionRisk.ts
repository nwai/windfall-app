import type { Draw } from "../types";
import { filterRowsForHistoryBaselines, getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export type MlndDrawScope = "mainAndSupp" | "mains";

export interface MlndHistoryScope {
  originalDrawCount: number;
  usedDrawCount: number;
  excludedMonthLabels: string[];
  firstDate: string | null;
  lastDate: string | null;
  history: Draw[];
}

export interface MlndRiskRow {
  number: number;
  riskScore: number;
  riskPercent: number;
  exclusionScore: number;
  liftVsBaseline: number;
  currentGap: number;
  currentGapLabel: string;
  recent13Hits: number;
  recent26Hits: number;
  recent52Hits: number;
  fullHits: number;
  hazardHits: number;
  hazardTrials: number;
  hazardRiskPercent: number;
  reason: string;
}

export interface MlndBacktestSummary {
  drawsEvaluated: number;
  minTrainingDraws: number;
  budget: number;
  meanFalseExcluded: number;
  randomMeanFalseExcluded: number;
  deltaVsRandom: number;
  meanCorrectExclusions: number;
  zeroFalseExclusionRate: number;
  bootstrapCI: [number, number] | null;
  pValue: number | null;
  verdict: string;
}

export interface MlndRiskAnalysis {
  scope: MlndDrawScope;
  drawSize: number;
  budget: number;
  baselineDrawRisk: number;
  historyScope: MlndHistoryScope;
  rows: MlndRiskRow[];
  excludedNumbers: number[];
  allowedNumbers: number[];
  watchNumbers: number[];
  backtest: MlndBacktestSummary;
}

export interface MlndRiskAnalysisOptions {
  scope?: MlndDrawScope;
  budget?: number;
  minTrainingDraws?: number;
  bootstrapIters?: number;
}

const NUMBER_POOL = Array.from({ length: 45 }, (_, index) => index + 1);

const clampBudget = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 37;
  return Math.max(1, Math.min(44, Math.round(numeric)));
};

const drawSizeForScope = (scope: MlndDrawScope): number => (scope === "mains" ? 6 : 8);

const uniqueSorted = (values: number[]): number[] => (
  Array.from(new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 45))).sort((a, b) => a - b)
);

const drawNumbersForScope = (draw: Draw, scope: MlndDrawScope): number[] => (
  scope === "mains" ? uniqueSorted(draw.main) : uniqueSorted([...draw.main, ...draw.supp])
);

const toMonthLabel = (draw: Draw): string | null => {
  const epoch = parseDrawDateToEpoch(draw.date);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const safeDate = (draw: Draw | undefined): string | null => draw?.date ?? null;

export const buildMlndHistoryScope = (history: Draw[]): MlndHistoryScope => {
  const chronological = sortDrawsChronologically(history)
    .filter((draw) => !draw.isSimulated)
    .filter((draw) => parseDrawDateToEpoch(draw.date) > 0);
  const entries = chronological
    .map((draw) => ({ draw, monthLabel: toMonthLabel(draw) }))
    .filter((entry): entry is { draw: Draw; monthLabel: string } => Boolean(entry.monthLabel));
  const filteredEntries = filterRowsForHistoryBaselines(entries, (entry) => entry.monthLabel);
  const excludedMonthLabels = getExcludedMonthLabelsForHistoryBaselines(entries, (entry) => entry.monthLabel);
  const scopedHistory = filteredEntries.map((entry) => entry.draw);

  return {
    originalDrawCount: chronological.length,
    usedDrawCount: scopedHistory.length,
    excludedMonthLabels,
    firstDate: safeDate(scopedHistory[0]),
    lastDate: safeDate(scopedHistory[scopedHistory.length - 1]),
    history: scopedHistory,
  };
};

const weightedHits = (
  history: Draw[],
  scope: MlndDrawScope,
  number: number,
  lookback: number,
): { hits: number; weightedRate: number } => {
  const slice = history.slice(-Math.max(1, Math.min(lookback, history.length)));
  if (!slice.length) return { hits: 0, weightedRate: 0 };
  const halfLife = Math.max(2, slice.length / 3);
  let numerator = 0;
  let denominator = 0;
  let hits = 0;
  slice.forEach((draw, index) => {
    const age = slice.length - 1 - index;
    const weight = Math.exp(-age / halfLife);
    const appeared = drawNumbersForScope(draw, scope).includes(number);
    if (appeared) {
      hits += 1;
      numerator += weight;
    }
    denominator += weight;
  });
  return { hits, weightedRate: denominator > 0 ? numerator / denominator : 0 };
};

const currentGapForNumber = (history: Draw[], scope: MlndDrawScope, number: number): number => {
  let gap = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (drawNumbersForScope(history[index], scope).includes(number)) return gap;
    gap += 1;
  }
  return gap;
};

interface HazardSamples {
  perNumber: Map<number, { gap: number; hit: boolean }[]>;
  global: { gap: number; hit: boolean }[];
}

const buildHazardSamples = (history: Draw[], scope: MlndDrawScope): HazardSamples => {
  const gaps = Array(46).fill(0);
  const perNumber = new Map<number, { gap: number; hit: boolean }[]>();
  const global: { gap: number; hit: boolean }[] = [];
  NUMBER_POOL.forEach((number) => perNumber.set(number, []));

  history.forEach((draw) => {
    const drawn = new Set(drawNumbersForScope(draw, scope));
    NUMBER_POOL.forEach((number) => {
      const sample = { gap: gaps[number], hit: drawn.has(number) };
      perNumber.get(number)?.push(sample);
      global.push(sample);
      gaps[number] = sample.hit ? 0 : gaps[number] + 1;
    });
  });

  return { perNumber, global };
};

const similarGap = (left: number, right: number): boolean => {
  if (left === right) return true;
  if (Math.abs(left - right) <= 2) return true;
  if (left >= 12 && right >= 12) return true;
  if (left >= 8 && right >= 8 && Math.abs(left - right) <= 4) return true;
  return false;
};

const estimateHazardRisk = (
  samples: HazardSamples,
  number: number,
  currentGap: number,
  baselineRisk: number,
): { risk: number; hits: number; trials: number } => {
  const local = (samples.perNumber.get(number) ?? []).filter((sample) => similarGap(sample.gap, currentGap));
  const global = samples.global.filter((sample) => similarGap(sample.gap, currentGap));
  const localHits = local.filter((sample) => sample.hit).length;
  const globalHits = global.filter((sample) => sample.hit).length;
  const globalTrials = global.length;
  const globalRate = globalTrials > 0 ? globalHits / globalTrials : baselineRisk;
  const priorStrength = 18;
  const localPrior = Math.max(0, globalRate) * priorStrength;
  const risk = (localHits + localPrior) / (local.length + priorStrength);
  return {
    risk,
    hits: localHits,
    trials: local.length,
  };
};

const formatGapLabel = (gap: number): string => {
  if (gap === 0) return "hit latest";
  if (gap === 1) return "missed latest";
  return `${gap} draw gap`;
};

const buildReason = (row: Omit<MlndRiskRow, "reason">): string => {
  const pieces: string[] = [];
  if (row.recent13Hits === 0) pieces.push("quiet in last 13");
  else pieces.push(`${row.recent13Hits} hit${row.recent13Hits === 1 ? "" : "s"} in last 13`);
  if (row.currentGap >= 8) pieces.push(`${row.currentGap} draw current gap`);
  if (row.liftVsBaseline < 0.85) pieces.push("below baseline risk");
  if (row.hazardTrials < 6) pieces.push("hazard evidence thin");
  return pieces.join(" · ");
};

export const buildMlndRiskRows = (
  history: Draw[],
  scope: MlndDrawScope,
): MlndRiskRow[] => {
  const drawSize = drawSizeForScope(scope);
  const baselineRisk = drawSize / 45;
  const hazardSamples = buildHazardSamples(history, scope);
  const maxRiskCap = Math.max(0.0001, baselineRisk * 2.2);

  const rawRows = NUMBER_POOL.map((number) => {
    const recent13 = weightedHits(history, scope, number, 13);
    const recent26 = weightedHits(history, scope, number, 26);
    const recent52 = weightedHits(history, scope, number, 52);
    const fullHits = history.reduce((count, draw) => (
      count + (drawNumbersForScope(draw, scope).includes(number) ? 1 : 0)
    ), 0);
    const longRisk = (fullHits + baselineRisk * 24) / (history.length + 24);
    const currentGap = currentGapForNumber(history, scope, number);
    const hazard = estimateHazardRisk(hazardSamples, number, currentGap, baselineRisk);
    const riskScore = (
      recent13.weightedRate * 0.22
      + recent26.weightedRate * 0.26
      + recent52.weightedRate * 0.18
      + longRisk * 0.16
      + hazard.risk * 0.18
    );
    const riskPercent = riskScore * 100;
    const exclusionScore = Math.max(0, Math.min(100, (1 - (riskScore / maxRiskCap)) * 100));
    const liftVsBaseline = baselineRisk > 0 ? riskScore / baselineRisk : 1;
    const rowWithoutReason = {
      number,
      riskScore,
      riskPercent,
      exclusionScore,
      liftVsBaseline,
      currentGap,
      currentGapLabel: formatGapLabel(currentGap),
      recent13Hits: recent13.hits,
      recent26Hits: recent26.hits,
      recent52Hits: recent52.hits,
      fullHits,
      hazardHits: hazard.hits,
      hazardTrials: hazard.trials,
      hazardRiskPercent: hazard.risk * 100,
    };
    return {
      ...rowWithoutReason,
      reason: buildReason(rowWithoutReason),
    };
  });

  return rawRows.sort((left, right) => (
    left.riskScore - right.riskScore
    || right.currentGap - left.currentGap
    || left.number - right.number
  ));
};

const seededRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const bootstrapMean = (
  values: number[],
  iterations: number,
  seed: number,
): { ci: [number, number] | null; pValue: number | null } => {
  if (values.length < 2 || iterations <= 0) return { ci: null, pValue: null };
  const rng = seededRng(seed);
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      sum += values[Math.floor(rng() * values.length)] ?? 0;
    }
    means.push(sum / values.length);
  }
  means.sort((left, right) => left - right);
  const ci: [number, number] = [
    means[Math.floor(0.025 * means.length)] ?? 0,
    means[Math.floor(0.975 * means.length)] ?? 0,
  ];
  const atOrBelowZero = means.filter((value) => value <= 0).length / means.length;
  const atOrAboveZero = means.filter((value) => value >= 0).length / means.length;
  const observedMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const pValue = observedMean >= 0 ? atOrBelowZero : atOrAboveZero;
  return { ci, pValue };
};

const mean = (values: number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

export const runMlndWalkForwardBacktest = (
  history: Draw[],
  options: Required<Pick<MlndRiskAnalysisOptions, "scope" | "budget" | "minTrainingDraws" | "bootstrapIters">>,
): MlndBacktestSummary => {
  const budget = clampBudget(options.budget);
  const drawSize = drawSizeForScope(options.scope);
  const start = Math.max(2, Math.min(options.minTrainingDraws, Math.max(2, history.length - 1)));
  const falseExcludedByDraw: number[] = [];
  const deltaByDraw: number[] = [];
  const randomExpected = budget * drawSize / 45;

  for (let targetIndex = start; targetIndex < history.length; targetIndex += 1) {
    const train = history.slice(0, targetIndex);
    const actual = new Set(drawNumbersForScope(history[targetIndex], options.scope));
    const predictedExcluded = new Set(
      buildMlndRiskRows(train, options.scope).slice(0, budget).map((row) => row.number),
    );
    let falseExcluded = 0;
    actual.forEach((number) => {
      if (predictedExcluded.has(number)) falseExcluded += 1;
    });
    falseExcludedByDraw.push(falseExcluded);
    deltaByDraw.push(randomExpected - falseExcluded);
  }

  const drawsEvaluated = falseExcludedByDraw.length;
  if (!drawsEvaluated) {
    return {
      drawsEvaluated: 0,
      minTrainingDraws: start,
      budget,
      meanFalseExcluded: 0,
      randomMeanFalseExcluded: randomExpected,
      deltaVsRandom: 0,
      meanCorrectExclusions: 0,
      zeroFalseExclusionRate: 0,
      bootstrapCI: null,
      pValue: null,
      verdict: "Not enough completed-history draws to validate.",
    };
  }

  const deltaVsRandom = mean(deltaByDraw);
  const bootstrap = bootstrapMean(deltaByDraw, options.bootstrapIters, 451);
  const ci = bootstrap.ci;
  const pValue = bootstrap.pValue;
  const verdict = deltaVsRandom > 0 && ci && ci[0] > 0
    ? "Validated lift over random in this history."
    : deltaVsRandom > 0
      ? "Small historical lift, not yet statistically secure."
      : "No demonstrated lift over random at this budget.";

  return {
    drawsEvaluated,
    minTrainingDraws: start,
    budget,
    meanFalseExcluded: mean(falseExcludedByDraw),
    randomMeanFalseExcluded: randomExpected,
    deltaVsRandom,
    meanCorrectExclusions: budget - mean(falseExcludedByDraw),
    zeroFalseExclusionRate: falseExcludedByDraw.filter((value) => value === 0).length / falseExcludedByDraw.length,
    bootstrapCI: ci,
    pValue,
    verdict,
  };
};

export const buildMlndRiskAnalysis = (
  rawHistory: Draw[],
  options: MlndRiskAnalysisOptions = {},
): MlndRiskAnalysis => {
  const scope = options.scope ?? "mainAndSupp";
  const budget = clampBudget(options.budget ?? 37);
  const minTrainingDraws = Math.max(20, Math.round(options.minTrainingDraws ?? 60));
  const bootstrapIters = Math.max(0, Math.round(options.bootstrapIters ?? 300));
  const historyScope = buildMlndHistoryScope(rawHistory);
  const rows = buildMlndRiskRows(historyScope.history, scope);
  const excludedNumbers = rows.slice(0, budget).map((row) => row.number).sort((left, right) => left - right);
  const excludedSet = new Set(excludedNumbers);
  const allowedNumbers = NUMBER_POOL.filter((number) => !excludedSet.has(number));
  const watchNumbers = rows.slice().sort((left, right) => right.riskScore - left.riskScore || left.number - right.number).slice(0, 8).map((row) => row.number);

  return {
    scope,
    drawSize: drawSizeForScope(scope),
    budget,
    baselineDrawRisk: drawSizeForScope(scope) / 45,
    historyScope,
    rows,
    excludedNumbers,
    allowedNumbers,
    watchNumbers,
    backtest: runMlndWalkForwardBacktest(historyScope.history, {
      scope,
      budget,
      minTrainingDraws,
      bootstrapIters,
    }),
  };
};

