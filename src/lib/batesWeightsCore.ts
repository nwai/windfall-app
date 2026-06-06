import { batesDiscreteWeights } from "./distributions/bates";

export interface BatesParameterSet {
  k: number;
  dualTri: boolean;
  triMode: number;
  triMode2: number;
  dualTriWeightA: number;
  mixWeight: number;
  betaHot: number;
  betaCold: number;
  betaGlobal: number;
  gammaConditional: number;
  hotQuantile: number;
  coldQuantile: number;
  highlightHotCold: boolean;
}

export interface BatesInputs {
  recentSignal?: number[];
  conditionalProb?: number[];
}

export interface BatesWeightsResult {
  finalWeights: number[];
  triWeights: number[];
  batesWeights: number[];
  baseConvex: number[];
  hotSet: Set<number>;
  coldSet: Set<number>;
  normalizedParams: BatesParameterSet;
}

const SLOT_COUNT = 45;
const MIN_QUANTILE_GAP = 0.05;

export const DEFAULT_BATES_PARAMETERS: BatesParameterSet = {
  k: 3,
  dualTri: false,
  triMode: 0.5,
  triMode2: 0.2,
  dualTriWeightA: 0.5,
  mixWeight: 0.5,
  betaHot: 0,
  betaCold: 0,
  betaGlobal: 0,
  gammaConditional: 0,
  hotQuantile: 0.7,
  coldQuantile: 0.3,
  highlightHotCold: true,
};

export function normalizeBatesParameters(params: Partial<BatesParameterSet> = {}): BatesParameterSet {
  const source = { ...DEFAULT_BATES_PARAMETERS, ...params };
  let hotQuantile = clampNumber(source.hotQuantile, 0.5, 0.95, DEFAULT_BATES_PARAMETERS.hotQuantile);
  let coldQuantile = clampNumber(source.coldQuantile, 0.05, 0.5, DEFAULT_BATES_PARAMETERS.coldQuantile);
  if (hotQuantile - coldQuantile < MIN_QUANTILE_GAP) {
    hotQuantile = Math.min(0.95, Math.max(0.5, coldQuantile + MIN_QUANTILE_GAP));
    if (hotQuantile - coldQuantile < MIN_QUANTILE_GAP) {
      coldQuantile = Math.max(0.05, hotQuantile - MIN_QUANTILE_GAP);
    }
  }

  return {
    k: clampInteger(source.k, 1, 60, DEFAULT_BATES_PARAMETERS.k),
    dualTri: source.dualTri === true,
    triMode: clampNumber(source.triMode, 0, 1, DEFAULT_BATES_PARAMETERS.triMode),
    triMode2: clampNumber(source.triMode2, 0, 1, DEFAULT_BATES_PARAMETERS.triMode2),
    dualTriWeightA: clampNumber(source.dualTriWeightA, 0, 1, DEFAULT_BATES_PARAMETERS.dualTriWeightA),
    mixWeight: clampNumber(source.mixWeight, 0, 1, DEFAULT_BATES_PARAMETERS.mixWeight),
    betaHot: clampNumber(source.betaHot, 0, 3, DEFAULT_BATES_PARAMETERS.betaHot),
    betaCold: clampNumber(source.betaCold, 0, 3, DEFAULT_BATES_PARAMETERS.betaCold),
    betaGlobal: clampNumber(source.betaGlobal, 0, 2, DEFAULT_BATES_PARAMETERS.betaGlobal),
    gammaConditional: clampNumber(source.gammaConditional, 0, 3, DEFAULT_BATES_PARAMETERS.gammaConditional),
    hotQuantile,
    coldQuantile,
    highlightHotCold: source.highlightHotCold !== false,
  };
}

export function computeBatesWeights(
  params: BatesParameterSet,
  inputs: BatesInputs,
): BatesWeightsResult {
  const normalizedParams = normalizeBatesParameters(params);
  const recentSignal = normalizeSignal(inputs.recentSignal);
  const conditionalProb = normalizeSignal(inputs.conditionalProb);
  const {
    k,
    dualTri,
    triMode,
    triMode2,
    dualTriWeightA,
    mixWeight,
    betaHot,
    betaCold,
    betaGlobal,
    gammaConditional,
    hotQuantile,
    coldQuantile,
    highlightHotCold,
  } = normalizedParams;

  const triWeights = dualTri
    ? dualTriangularDiscrete(SLOT_COUNT, triMode, triMode2, dualTriWeightA)
    : singleTriangularDiscrete(SLOT_COUNT, triMode);
  const batesWeights = normalizeWeights(batesDiscreteWeights(SLOT_COUNT, k));
  const baseConvex = normalizeWeights(triWeights.map((triWeight, index) => (
    mixWeight * triWeight + (1 - mixWeight) * batesWeights[index]
  )));

  const hotSet = new Set<number>();
  const coldSet = new Set<number>();
  if (recentSignal && highlightHotCold) {
    const coldCutoff = quantile(recentSignal, coldQuantile);
    const hotCutoff = quantile(recentSignal, hotQuantile);
    recentSignal.forEach((value, index) => {
      if (value <= coldCutoff) coldSet.add(index + 1);
      if (value >= hotCutoff) hotSet.add(index + 1);
    });
  }

  let finalWeights = baseConvex.slice();
  if (recentSignal && (betaHot > 0 || betaCold > 0)) {
    const zScores = robustZScores(recentSignal);
    finalWeights = normalizeWeights(finalWeights.map((weight, index) => {
      const number = index + 1;
      const hotBoost = hotSet.has(number) ? Math.max(0, zScores[index]) : 0;
      const coldBoost = coldSet.has(number) ? Math.max(0, -zScores[index]) : 0;
      return weight * boundedExp((betaHot * hotBoost + betaCold * coldBoost) / 4);
    }));
  }

  if (recentSignal && betaGlobal > 0) {
    const zScores = robustZScores(recentSignal);
    finalWeights = normalizeWeights(finalWeights.map((weight, index) => (
      weight * boundedExp((betaGlobal * zScores[index]) / 4)
    )));
  }

  if (conditionalProb && gammaConditional > 0) {
    const zScores = robustZScores(conditionalProb);
    finalWeights = normalizeWeights(finalWeights.map((weight, index) => (
      weight * boundedExp((gammaConditional * zScores[index]) / 4)
    )));
  }

  return {
    finalWeights,
    triWeights,
    batesWeights,
    baseConvex,
    hotSet,
    coldSet,
    normalizedParams,
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));
}

function triangularPdfAt(x: number, mode: number): number {
  if (x < 0 || x > 1) return 0;
  if (mode <= 0) return 2 * (1 - x);
  if (mode >= 1) return 2 * x;
  return x <= mode ? (2 * x) / mode : (2 * (1 - x)) / (1 - mode);
}

function singleTriangularDiscrete(slotCount: number, mode: number): number[] {
  const weights = Array.from({ length: slotCount }, (_, index) => {
    const x = (index + 0.5) / slotCount;
    return triangularPdfAt(x, mode);
  });
  return normalizeWeights(weights);
}

function dualTriangularDiscrete(slotCount: number, modeA: number, modeB: number, weightA: number): number[] {
  const triA = singleTriangularDiscrete(slotCount, modeA);
  const triB = singleTriangularDiscrete(slotCount, modeB);
  return normalizeWeights(triA.map((value, index) => weightA * value + (1 - weightA) * triB[index]));
}

function normalizeSignal(values: number[] | undefined): number[] | null {
  if (!Array.isArray(values) || values.length !== SLOT_COUNT) return null;
  const clean = values.map((value) => finiteNumber(value, Number.NaN));
  return clean.every(Number.isFinite) ? clean : null;
}

function normalizeWeights(weights: number[]): number[] {
  const clean = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const weight = weights[index] ?? 0;
    return Number.isFinite(weight) ? Math.max(0, weight) : 0;
  });
  const sum = clean.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) return Array.from({ length: SLOT_COUNT }, () => 1 / SLOT_COUNT);
  return clean.map((weight) => weight / sum);
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))];
}

function robustZScores(values: number[]): number[] {
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations) * 1.4826;
  const scale = mad > 1e-12 ? mad : standardDeviation(values) || 1;
  return values.map((value) => Math.max(-4, Math.min(4, (value - center) / scale)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function boundedExp(value: number): number {
  return Math.exp(Math.max(-4, Math.min(4, value)));
}
