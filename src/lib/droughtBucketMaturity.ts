import type { Draw } from "../types";
import {
  countScheduledDrawsInMonth,
  isScheduledDrawDate,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export const DROUGHT_BUCKET_MATURITY_WARMUP_DRAWS = 24;
export const DROUGHT_BUCKET_MATURITY_BASELINE = 8 / 45;

export type DroughtBucketMaturityStatus =
  | "at-boundary"
  | "near-boundary"
  | "long-tail"
  | "within-range"
  | "stage-start"
  | "unavailable";

export type DroughtBucketMaturitySample = "none" | "thin" | "limited" | "broader";

export interface DroughtBucketMaturityRow {
  number: number;
  bucketCount: number;
  currentDrought: number | null;
  structuralMaxDrought: number | null;
  historicalPercentile: number | null;
  historicalP95Drought: number | null;
  comparableStates: number;
  tailTrials: number;
  tailHitsNext: number;
  tailRawRate: number | null;
  liftVsBaseline: number | null;
  sample: DroughtBucketMaturitySample;
  status: DroughtBucketMaturityStatus;
}

export interface DroughtBucketMaturityResult {
  byNumber: DroughtBucketMaturityRow[];
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  warmupDraws: number;
  analyzedTargetDraws: number;
  baselineProbability: number;
}

export interface DroughtBucketMaturityOptions {
  baselineHistory: readonly Draw[];
  currentHistory?: readonly Draw[];
  targetDrawDate?: string;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  warmupDraws?: number;
}

interface PreparedDraw {
  date: string;
  epoch: number;
  monthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  numbers: Set<number>;
}

interface HistoricalState {
  currentDrought: number;
  hitNext: boolean;
}

const normalizeBucketCount = (count: number): number => Math.min(8, Math.max(0, Math.round(count)));

const prepareHistory = (history: readonly Draw[]): PreparedDraw[] => (
  sortDrawsChronologically(history.filter((draw) => !draw.isSimulated).map((draw) => ({ ...draw })))
    .map((draw) => {
      const parts = parseDrawDateParts(draw.date);
      if (!parts || !isScheduledDrawDate(parts)) return null;
      const numbers = new Set(
        [...(draw.main ?? []), ...(draw.supp ?? [])]
          .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45),
      );
      if (numbers.size !== 8) return null;
      const monthLabel = monthLabelFromDateParts(parts);
      return {
        date: draw.date,
        epoch: parseDrawDateToEpoch(draw.date),
        monthLabel,
        drawOrdinal: countScheduledDrawsInMonth(monthLabel, parts.day),
        expectedMonthDrawCount: countScheduledDrawsInMonth(monthLabel),
        numbers,
      };
    })
    .filter((draw): draw is PreparedDraw => draw !== null && draw.epoch > 0)
);

const comparisonKey = (monthDrawCount: number, drawOrdinal: number, bucketCount: number): string => (
  `${monthDrawCount}D|D${drawOrdinal}|${bucketCount}x`
);

const nearestRankQuantile = (values: readonly number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? null;
};

const sampleLabel = (trials: number): DroughtBucketMaturitySample => {
  if (trials <= 0) return "none";
  if (trials < 20) return "thin";
  if (trials < 50) return "limited";
  return "broader";
};

const buildHistoricalStates = (
  history: readonly Draw[],
  warmupDraws: number,
): { states: Map<string, HistoricalState[]>; analyzedTargetDraws: number } => {
  const prepared = prepareHistory(history);
  const drought = new Array<number>(46).fill(0);
  const appeared = new Array<boolean>(46).fill(false);
  const monthlyCounts = new Array<number>(46).fill(0);
  const states = new Map<string, HistoricalState[]>();
  let currentMonthLabel = "";
  let analyzedTargetDraws = 0;

  prepared.forEach((draw, drawIndex) => {
    if (draw.monthLabel !== currentMonthLabel) {
      currentMonthLabel = draw.monthLabel;
      monthlyCounts.fill(0);
    }

    if (drawIndex >= warmupDraws) {
      analyzedTargetDraws += 1;
      for (let number = 1; number <= 45; number += 1) {
        if (!appeared[number]) continue;
        const bucketCount = normalizeBucketCount(monthlyCounts[number]);
        const key = comparisonKey(draw.expectedMonthDrawCount, draw.drawOrdinal, bucketCount);
        const rows = states.get(key) ?? [];
        rows.push({
          currentDrought: drought[number],
          hitNext: draw.numbers.has(number),
        });
        states.set(key, rows);
      }
    }

    for (let number = 1; number <= 45; number += 1) {
      if (draw.numbers.has(number)) {
        appeared[number] = true;
        drought[number] = 0;
        monthlyCounts[number] += 1;
      } else if (appeared[number]) {
        drought[number] += 1;
      }
    }
  });

  return { states, analyzedTargetDraws };
};

const buildCurrentState = (
  history: readonly Draw[],
  targetDrawDate: string | undefined,
  targetMonthLabel: string,
): { drought: Array<number | null>; monthlyCounts: number[] } => {
  const targetEpoch = targetDrawDate ? parseDrawDateToEpoch(targetDrawDate) : Number.POSITIVE_INFINITY;
  const prepared = prepareHistory(history).filter((draw) => draw.epoch < targetEpoch);
  const drought = new Array<number | null>(46).fill(null);
  const monthlyCounts = new Array<number>(46).fill(0);

  prepared.forEach((draw) => {
    for (let number = 1; number <= 45; number += 1) {
      if (draw.numbers.has(number)) {
        drought[number] = 0;
      } else if (drought[number] !== null) {
        drought[number] = (drought[number] ?? 0) + 1;
      }
    }
    if (draw.monthLabel === targetMonthLabel) {
      draw.numbers.forEach((number) => {
        monthlyCounts[number] += 1;
      });
    }
  });

  return { drought, monthlyCounts };
};

const statusForRow = (
  bucketCount: number,
  currentDrought: number | null,
  structuralMaxDrought: number | null,
  historicalPercentile: number | null,
): DroughtBucketMaturityStatus => {
  if (currentDrought === null) return "unavailable";
  if (bucketCount > 0 && structuralMaxDrought === 0) return "stage-start";
  if (bucketCount > 0 && structuralMaxDrought !== null) {
    const remaining = structuralMaxDrought - currentDrought;
    if (remaining <= 0) return "at-boundary";
    if (remaining === 1) return "near-boundary";
  }
  if (historicalPercentile !== null && historicalPercentile >= 0.95) return "long-tail";
  return "within-range";
};

/**
 * Observe-only bucket-conditioned drought maturity.
 *
 * Historical outcomes are grouped from the state immediately before each
 * target draw, so the target draw is never used to construct its own state.
 * This evidence is deliberately independent of per-number completed 6+ drought
 * episode counts used by the strict shortlist ranking.
 */
export const analyzeDroughtBucketMaturity = (
  options: DroughtBucketMaturityOptions,
): DroughtBucketMaturityResult => {
  const warmupDraws = Math.max(0, Math.round(options.warmupDraws ?? DROUGHT_BUCKET_MATURITY_WARMUP_DRAWS));
  const targetDrawOrdinal = Math.max(1, Math.round(options.targetDrawOrdinal));
  const targetMonthExpectedDrawCount = Math.max(targetDrawOrdinal, Math.round(options.targetMonthExpectedDrawCount));
  const { states, analyzedTargetDraws } = buildHistoricalStates(options.baselineHistory, warmupDraws);
  const current = buildCurrentState(
    options.currentHistory ?? options.baselineHistory,
    options.targetDrawDate,
    options.targetMonthLabel,
  );

  const byNumber = Array.from({ length: 45 }, (_, index): DroughtBucketMaturityRow => {
    const number = index + 1;
    const bucketCount = normalizeBucketCount(current.monthlyCounts[number]);
    const currentDrought = current.drought[number];
    const structuralMaxDrought = bucketCount > 0
      ? Math.max(0, targetDrawOrdinal - 1 - bucketCount)
      : null;
    const comparable = states.get(comparisonKey(
      targetMonthExpectedDrawCount,
      targetDrawOrdinal,
      bucketCount,
    )) ?? [];
    const historicalPercentile = currentDrought === null || !comparable.length
      ? null
      : comparable.filter((state) => state.currentDrought <= currentDrought).length / comparable.length;
    const historicalP95Drought = nearestRankQuantile(
      comparable.map((state) => state.currentDrought),
      0.95,
    );
    const tail = currentDrought === null
      ? []
      : comparable.filter((state) => state.currentDrought >= currentDrought);
    const tailHitsNext = tail.filter((state) => state.hitNext).length;
    const tailRawRate = tail.length > 0 ? tailHitsNext / tail.length : null;

    return {
      number,
      bucketCount,
      currentDrought,
      structuralMaxDrought,
      historicalPercentile,
      historicalP95Drought,
      comparableStates: comparable.length,
      tailTrials: tail.length,
      tailHitsNext,
      tailRawRate,
      liftVsBaseline: tailRawRate === null ? null : tailRawRate - DROUGHT_BUCKET_MATURITY_BASELINE,
      sample: sampleLabel(tail.length),
      status: statusForRow(bucketCount, currentDrought, structuralMaxDrought, historicalPercentile),
    };
  });

  return {
    byNumber,
    targetMonthLabel: options.targetMonthLabel,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
    warmupDraws,
    analyzedTargetDraws,
    baselineProbability: DROUGHT_BUCKET_MATURITY_BASELINE,
  };
};
