import type { Draw } from "../types";
import { backtestStrictDroughtShortlist, type StrictDroughtBacktestRecord } from "./backtestDrought";
import {
  computeStrictDroughtShortlist,
  STRICT_DROUGHT_DEFAULT_THRESHOLD,
  type StrictDroughtNumberRow,
} from "./droughtHazard";

const LOTTERY_NUMBER_COUNT = 45;
const DRAW_SIZE = 8;
const DEFAULT_TOP_K = 8;
const MIN_EXACT_STAGE_TRIALS = 6;
const MIN_ORDINAL_TRIALS = 12;
const MIN_ALL_TRIALS = 24;

export type StrictDroughtQuotaControlMode = "off" | "manual" | "advised";
export type StrictDroughtQuotaAdviceSource = "exact-stage" | "draw-ordinal" | "all-baseline" | "insufficient";
export type StrictDroughtQuotaConfidence = "low" | "moderate" | "strong";

export interface StrictDroughtQuotaShortlist {
  threshold: number;
  topK: number;
  rows: StrictDroughtNumberRow[];
  numbers: number[];
  rankMultipliers: Record<number, number>;
}

export interface StrictDroughtQuotaAdvice {
  shouldApplyQuota: boolean;
  recommendedMinCount: number;
  confidence: StrictDroughtQuotaConfidence;
  source: StrictDroughtQuotaAdviceSource;
  sourceLabel: string;
  reason: string;
  traceLabel: string;
  trials: number;
  averageHits: number;
  expectedRandomAverageHits: number;
  oneToThreeHitRate: number;
  expectedRandomOneToThreeHitRate: number;
  oneToThreeLift: number;
  zeroHitRate: number;
  expectedRandomZeroHitRate: number;
  distribution: Record<"0" | "1" | "2" | "3" | "4+", number>;
}

export interface BuildStrictDroughtQuotaAdviceOptions {
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
  currentShortlistSize?: number;
  topK?: number;
  threshold?: number;
  minHistory?: number;
}

export function buildStrictDroughtQuotaShortlist(
  activeHistory: Draw[],
  fullHistory: Draw[],
  options: { topK?: number; threshold?: number } = {},
): StrictDroughtQuotaShortlist {
  const topK = Math.max(1, Math.min(45, Math.round(options.topK ?? DEFAULT_TOP_K)));
  const threshold = Math.max(1, Math.round(options.threshold ?? STRICT_DROUGHT_DEFAULT_THRESHOLD));
  const rows = computeStrictDroughtShortlist(activeHistory, fullHistory, { threshold }).rows.slice(0, topK);
  const rankMultipliers = rows.reduce<Record<number, number>>((acc, row, index) => {
    acc[row.number] = 1 + ((rows.length - index) / Math.max(1, rows.length));
    return acc;
  }, {});

  return {
    threshold,
    topK,
    rows,
    numbers: rows.map((row) => row.number),
    rankMultipliers,
  };
}

function combinations(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = result * (n - k + i) / i;
  }
  return result;
}

function hypergeometricProbability(shortlistSize: number, hits: number): number {
  const k = Math.max(0, Math.min(LOTTERY_NUMBER_COUNT, Math.round(shortlistSize)));
  const denominator = combinations(LOTTERY_NUMBER_COUNT, DRAW_SIZE);
  if (denominator <= 0) return 0;
  return combinations(k, hits) * combinations(LOTTERY_NUMBER_COUNT - k, DRAW_SIZE - hits) / denominator;
}

function expectedRandomOneToThree(shortlistSize: number): number {
  return [1, 2, 3].reduce((sum, hits) => sum + hypergeometricProbability(shortlistSize, hits), 0);
}

function summarizeRecords(records: StrictDroughtBacktestRecord[]) {
  const distribution: StrictDroughtQuotaAdvice["distribution"] = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4+": 0,
  };

  for (const record of records) {
    const key = record.hitCount >= 4 ? "4+" : String(record.hitCount) as keyof typeof distribution;
    distribution[key] += 1;
  }

  const trials = records.length;
  const totalHits = records.reduce((sum, record) => sum + record.hitCount, 0);
  const expectedRandomHits = records.reduce((sum, record) => sum + DRAW_SIZE * record.shortlist.length / LOTTERY_NUMBER_COUNT, 0);
  const expectedRandomZero = records.reduce((sum, record) => sum + hypergeometricProbability(record.shortlist.length, 0), 0);
  const expectedRandomBand = records.reduce((sum, record) => sum + expectedRandomOneToThree(record.shortlist.length), 0);
  const oneToThreeCount = distribution["1"] + distribution["2"] + distribution["3"];

  return {
    trials,
    distribution,
    averageHits: trials ? totalHits / trials : 0,
    expectedRandomAverageHits: trials ? expectedRandomHits / trials : 0,
    oneToThreeHitRate: trials ? oneToThreeCount / trials : 0,
    expectedRandomOneToThreeHitRate: trials ? expectedRandomBand / trials : 0,
    zeroHitRate: trials ? distribution["0"] / trials : 0,
    expectedRandomZeroHitRate: trials ? expectedRandomZero / trials : 0,
  };
}

function positiveMode(distribution: StrictDroughtQuotaAdvice["distribution"]): number {
  const rows = [1, 2, 3]
    .map((count) => ({ count, trials: distribution[String(count) as "1" | "2" | "3"] }))
    .filter((row) => row.trials > 0)
    .sort((left, right) => right.trials - left.trials || left.count - right.count);
  return rows[0]?.count ?? 0;
}

export function buildStrictDroughtQuotaAdvice(
  history: Draw[],
  options: BuildStrictDroughtQuotaAdviceOptions = {},
): StrictDroughtQuotaAdvice {
  const topK = Math.max(1, Math.min(45, Math.round(options.topK ?? DEFAULT_TOP_K)));
  const threshold = Math.max(1, Math.round(options.threshold ?? STRICT_DROUGHT_DEFAULT_THRESHOLD));
  const minHistory = Math.max(1, Math.round(options.minHistory ?? 24));
  const targetDrawOrdinal = Math.max(1, Math.round(options.targetDrawOrdinal ?? 1));
  const targetMonthExpectedDrawCount = Math.max(1, Math.round(options.targetMonthExpectedDrawCount ?? 13));
  const currentShortlistSize = Math.max(0, Math.min(topK, Math.round(options.currentShortlistSize ?? topK)));

  const emptySummary = summarizeRecords([]);
  if (history.length <= minHistory || currentShortlistSize <= 0) {
    return {
      shouldApplyQuota: false,
      recommendedMinCount: 0,
      confidence: "low",
      source: "insufficient",
      sourceLabel: "Not enough strict drought evidence",
      reason: currentShortlistSize <= 0
        ? "The current strict drought shortlist is empty after thresholding."
        : `Needs more than ${minHistory} baseline draws for a no-lookahead replay.`,
      traceLabel: "Strict drought quota advice: unavailable",
      ...emptySummary,
      oneToThreeLift: 0,
    };
  }

  const replay = backtestStrictDroughtShortlist(history, {
    minHistory,
    topK,
    threshold,
    randomTrials: 0,
    bootstrapIterations: 0,
  });

  const exactStageRecords = replay.records.filter((record) =>
    record.targetMonthComplete
    && record.targetMonthDrawCount === targetMonthExpectedDrawCount
    && record.targetDrawOrdinal === targetDrawOrdinal
  );
  const ordinalRecords = replay.records.filter((record) => record.targetDrawOrdinal === targetDrawOrdinal);

  let source: StrictDroughtQuotaAdviceSource = "insufficient";
  let sourceLabel = "Not enough strict drought evidence";
  let records: StrictDroughtBacktestRecord[] = [];

  if (exactStageRecords.length >= MIN_EXACT_STAGE_TRIALS) {
    source = "exact-stage";
    sourceLabel = `${targetMonthExpectedDrawCount}D month D${targetDrawOrdinal}`;
    records = exactStageRecords;
  } else if (ordinalRecords.length >= MIN_ORDINAL_TRIALS) {
    source = "draw-ordinal";
    sourceLabel = `All D${targetDrawOrdinal} rows`;
    records = ordinalRecords;
  } else if (replay.records.length >= MIN_ALL_TRIALS) {
    source = "all-baseline";
    sourceLabel = "All eligible replay rows";
    records = replay.records;
  }

  if (!records.length) {
    return {
      shouldApplyQuota: false,
      recommendedMinCount: 0,
      confidence: "low",
      source,
      sourceLabel,
      reason: "The replay slice is too thin to suggest a quota.",
      traceLabel: "Strict drought quota advice: unavailable",
      ...emptySummary,
      oneToThreeLift: 0,
    };
  }

  const summary = summarizeRecords(records);
  const oneToThreeLift = summary.oneToThreeHitRate - summary.expectedRandomOneToThreeHitRate;
  const averageHitLift = summary.averageHits - summary.expectedRandomAverageHits;
  const hasPositiveSupport = oneToThreeLift >= 0.02 || averageHitLift >= 0.12;
  const rawMode = positiveMode(summary.distribution);
  const fallbackCount = Math.max(1, Math.min(3, Math.round(summary.averageHits)));
  const recommendedMinCount = hasPositiveSupport
    ? Math.max(1, Math.min(3, currentShortlistSize, rawMode || fallbackCount))
    : 0;
  const confidence: StrictDroughtQuotaConfidence =
    summary.trials >= 20 && oneToThreeLift >= 0.05 ? "strong"
      : summary.trials >= 12 && hasPositiveSupport ? "moderate"
        : "low";
  const shouldApplyQuota = recommendedMinCount > 0;
  const liftPoints = (oneToThreeLift * 100).toFixed(1);
  const reason = shouldApplyQuota
    ? `${sourceLabel}: ${summary.trials} no-lookahead trial${summary.trials === 1 ? "" : "s"}, 1-3 hit rate ${(summary.oneToThreeHitRate * 100).toFixed(1)}% vs random ${(summary.expectedRandomOneToThreeHitRate * 100).toFixed(1)}% (${liftPoints}pp lift).`
    : `${sourceLabel}: ${summary.trials} no-lookahead trial${summary.trials === 1 ? "" : "s"} did not beat the random-size 1-3 hit baseline enough for an advised quota.`;

  return {
    shouldApplyQuota,
    recommendedMinCount,
    confidence,
    source,
    sourceLabel,
    reason,
    traceLabel: shouldApplyQuota
      ? `Strict drought quota advice: ${confidence} · minimum ${recommendedMinCount} from current top ${currentShortlistSize} · ${sourceLabel}`
      : `Strict drought quota advice: observe only · ${sourceLabel}`,
    ...summary,
    oneToThreeLift,
  };
}
