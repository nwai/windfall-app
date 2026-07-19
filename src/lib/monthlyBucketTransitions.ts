import type { Draw } from "../types";
import {
  filterRowsForHistoryBaselines,
  getExcludedMonthLabelsForHistoryBaselines,
} from "./monthlyAverageScope";

export const MONTHLY_TRANSITION_BUCKET_LABELS = [
  "Undrawn",
  "1x",
  "2x",
  "3x",
  "4x",
  "5x",
  "6x",
  "7x",
  "8x+",
] as const;

export type MonthlyTransitionBucketIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type MonthlyTransitionHeatTier = "cold" | "middle" | "hot" | "flat";
export type MonthlyTransitionLengthFilter = number | "all";

export interface MonthlyBucketTransitionOptions {
  includeSupp?: boolean;
  maxNumber?: number;
  monthLength?: MonthlyTransitionLengthFilter;
  priorStrength?: number;
}

export interface MonthlyBucketTransitionEvent {
  monthLabel: string;
  totalDrawCount: number;
  drawOrdinal: number;
  drawDate: string;
  number: number;
  beforeBucket: MonthlyTransitionBucketIndex;
  afterBucket: MonthlyTransitionBucketIndex;
  drawn: boolean;
  priorHeatCount: number;
  priorHeatTier: MonthlyTransitionHeatTier;
}

export interface MonthlyBucketTransitionDrawState {
  drawOrdinal: number;
  drawDate: string;
  distribution: number[];
  countsAfter: number[];
}

export interface MonthlyBucketTransitionMonth {
  monthLabel: string;
  drawCount: number;
  totalDrawCount: number;
  isComplete: boolean;
  finalDistribution: number[];
  drawStates: MonthlyBucketTransitionDrawState[];
  events: MonthlyBucketTransitionEvent[];
}

export interface MonthlyBucketTransitionPlanningState {
  monthLabel: string;
  sourceMonthLabel: string | null;
  source: "current-month" | "planning-reset";
  completedDrawCount: number;
  expectedDrawCount: number;
  nextDrawOrdinal: number;
  currentDistribution: number[];
}

export interface MonthlyBucketExpectationRow {
  bucket: MonthlyTransitionBucketIndex;
  label: string;
  currentCount: number;
  trials: number;
  hits: number;
  rawRate: number | null;
  smoothedRate: number;
  expectedHits: number;
}

export interface MonthlyUndrawnSurvivalRow {
  drawOrdinal: number;
  monthsWithStage: number;
  trials: number;
  breaks: number;
  rawBreakRate: number | null;
  smoothedBreakRate: number;
  estimatedSurvivalRate: number;
  medianUndrawnAfter: number | null;
  q1UndrawnAfter: number | null;
  q3UndrawnAfter: number | null;
}

export interface MonthlyBucketFirstReachRow {
  bucket: MonthlyTransitionBucketIndex;
  label: string;
  monthsEligible: number;
  monthsReached: number;
  reachedRate: number;
  reachedByPlanningStage: number;
  reachedByPlanningStageRate: number;
  earliestDrawMedian: number | null;
  earliestDrawQ1: number | null;
  earliestDrawQ3: number | null;
  monthEndMedianCount: number | null;
}

export interface MonthlyLengthComparisonRow {
  monthLength: number;
  months: number;
  completeMonths: number;
  medianUndrawnEnd: number | null;
  median1xEnd: number | null;
  median2xEnd: number | null;
  median3xEnd: number | null;
  median4xEnd: number | null;
  median5xEnd: number | null;
  median6PlusEnd: number | null;
}

export interface MonthlyHeatBucketRow {
  bucket: MonthlyTransitionBucketIndex;
  label: string;
  heatTier: MonthlyTransitionHeatTier;
  trials: number;
  hits: number;
  rawRate: number | null;
  smoothedRate: number;
}

export type MonthlyTransitionSupport = "above" | "neutral" | "below" | "thin";

export interface MonthlyTransitionNumberContext {
  number: number;
  bucket: MonthlyTransitionBucketIndex;
  label: string;
  bucketCurrentCount: number;
  trials: number;
  hits: number;
  rawRate: number | null;
  smoothedRate: number;
  planningAverageRate: number;
  rateLift: number;
  support: MonthlyTransitionSupport;
}

export interface MonthlyBucketTransitionAnalysis {
  scopeLabel: string;
  warnings: string[];
  excludedOpeningMonthLabels: string[];
  allMonthCount: number;
  baselineMonthCount: number;
  selectedMonthLength: MonthlyTransitionLengthFilter;
  selectedMonthCount: number;
  selectedCompleteMonthCount: number;
  monthLengthOptions: number[];
  latestObservedMonth: MonthlyBucketTransitionMonth | null;
  planningState: MonthlyBucketTransitionPlanningState | null;
  currentExpectations: MonthlyBucketExpectationRow[];
  undrawnSurvivalRows: MonthlyUndrawnSurvivalRow[];
  firstReachRows: MonthlyBucketFirstReachRow[];
  monthLengthComparisonRows: MonthlyLengthComparisonRow[];
  heatBucketRows: MonthlyHeatBucketRow[];
}

interface ParsedDraw {
  date: string;
  timestamp: number;
  monthLabel: string;
  numbers: number[];
}

interface RateCount {
  trials: number;
  hits: number;
}

const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_PRIOR_STRENGTH = 24;
const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASH_DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;

const bucketIndexForCount = (count: number): MonthlyTransitionBucketIndex => (
  Math.min(Math.max(Math.floor(count), 0), 8) as MonthlyTransitionBucketIndex
);

const distributionFromCounts = (counts: readonly number[], maxNumber: number): number[] => {
  const distribution = new Array(9).fill(0);
  for (let index = 0; index < maxNumber; index += 1) {
    distribution[bucketIndexForCount(counts[index] ?? 0)] += 1;
  }
  return distribution;
};

const parseTimestamp = (rawDate: string | undefined): number | null => {
  if (!rawDate) return null;
  const iso = rawDate.match(ISO_DATE_RE);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day
    ) {
      return date.getTime();
    }
    return null;
  }

  const slash = rawDate.match(SLASH_DATE_RE);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day
    ) {
      return date.getTime();
    }
    return null;
  }

  const timestamp = Date.parse(rawDate);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const monthLabelFromTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const parseMonthParts = (monthLabel: string): { year: number; month: number } | null => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const nextMonthLabel = (monthLabel: string): string | null => {
  const parts = parseMonthParts(monthLabel);
  if (!parts) return null;
  if (parts.month === 12) return `${parts.year + 1}-01`;
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}`;
};

const countScheduledDrawsInMonth = (monthLabel: string): number => {
  const parts = parseMonthParts(monthLabel);
  if (!parts) return 0;
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(parts.year, parts.month - 1, day);
    if (date.getMonth() !== parts.month - 1) break;
    const weekday = date.getDay();
    if (weekday === 1 || weekday === 3 || weekday === 5) count += 1;
  }
  return count;
};

const quantile = (values: readonly number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const heatTierForNumber = (
  priorCounts: readonly number[],
  number: number,
): MonthlyTransitionHeatTier => {
  const maxCount = Math.max(...priorCounts);
  const minCount = Math.min(...priorCounts);
  if (maxCount === minCount) return "flat";
  const q33 = quantile(priorCounts, 0.33) ?? minCount;
  const q67 = quantile(priorCounts, 0.67) ?? maxCount;
  const value = priorCounts[number - 1] ?? 0;
  if (value <= q33) return "cold";
  if (value >= q67) return "hot";
  return "middle";
};

const parseHistory = (
  history: readonly Draw[],
  includeSupp: boolean,
  maxNumber: number,
): ParsedDraw[] => history
  .filter((draw) => !draw.isSimulated)
  .map((draw) => {
    const timestamp = parseTimestamp(draw.date);
    if (timestamp === null) return null;
    const seen = new Set<number>();
    const sourceNumbers = includeSupp ? [...(draw.main ?? []), ...(draw.supp ?? [])] : [...(draw.main ?? [])];
    sourceNumbers.forEach((value) => {
      if (!Number.isInteger(value) || value < 1 || value > maxNumber) return;
      seen.add(value);
    });
    return {
      date: draw.date,
      timestamp,
      monthLabel: monthLabelFromTimestamp(timestamp),
      numbers: [...seen].sort((a, b) => a - b),
    };
  })
  .filter((item): item is ParsedDraw => item !== null)
  .sort((a, b) => a.timestamp - b.timestamp);

export const buildMonthlyBucketTransitionMonths = (
  history: readonly Draw[],
  options: Pick<MonthlyBucketTransitionOptions, "includeSupp" | "maxNumber"> = {},
): MonthlyBucketTransitionMonth[] => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const parsed = parseHistory(history, includeSupp, maxNumber);
  const byMonth = new Map<string, ParsedDraw[]>();

  parsed.forEach((draw) => {
    byMonth.set(draw.monthLabel, [...(byMonth.get(draw.monthLabel) ?? []), draw]);
  });

  const globalPriorCounts = new Array(maxNumber).fill(0);
  const months: MonthlyBucketTransitionMonth[] = [];

  [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([monthLabel, draws]) => {
      const sortedDraws = [...draws].sort((a, b) => a.timestamp - b.timestamp);
      const totalDrawCount = Math.max(sortedDraws.length, countScheduledDrawsInMonth(monthLabel));
      const monthlyCounts = new Array(maxNumber).fill(0);
      const drawStates: MonthlyBucketTransitionDrawState[] = [];
      const events: MonthlyBucketTransitionEvent[] = [];

      sortedDraws.forEach((draw, drawIndex) => {
        const drawOrdinal = drawIndex + 1;
        const drawnSet = new Set(draw.numbers);

        for (let number = 1; number <= maxNumber; number += 1) {
          const beforeCount = monthlyCounts[number - 1] ?? 0;
          const beforeBucket = bucketIndexForCount(beforeCount);
          const drawn = drawnSet.has(number);
          const afterBucket = bucketIndexForCount(beforeCount + (drawn ? 1 : 0));
          events.push({
            monthLabel,
            totalDrawCount,
            drawOrdinal,
            drawDate: draw.date,
            number,
            beforeBucket,
            afterBucket,
            drawn,
            priorHeatCount: globalPriorCounts[number - 1] ?? 0,
            priorHeatTier: heatTierForNumber(globalPriorCounts, number),
          });
        }

        draw.numbers.forEach((number) => {
          monthlyCounts[number - 1] += 1;
          globalPriorCounts[number - 1] += 1;
        });

        drawStates.push({
          drawOrdinal,
          drawDate: draw.date,
          distribution: distributionFromCounts(monthlyCounts, maxNumber),
          countsAfter: [...monthlyCounts],
        });
      });

      months.push({
        monthLabel,
        drawCount: sortedDraws.length,
        totalDrawCount,
        isComplete: sortedDraws.length >= totalDrawCount,
        finalDistribution: distributionFromCounts(monthlyCounts, maxNumber),
        drawStates,
        events,
      });
    });

  return months;
};

const monthMatchesLength = (
  month: MonthlyBucketTransitionMonth,
  selectedMonthLength: MonthlyTransitionLengthFilter,
): boolean => selectedMonthLength === "all" || month.totalDrawCount === selectedMonthLength;

const emptyRateCount = (): RateCount => ({ trials: 0, hits: 0 });

const aggregateBucketRates = (
  months: readonly MonthlyBucketTransitionMonth[],
  predicate: (event: MonthlyBucketTransitionEvent) => boolean,
): RateCount[] => {
  const rows = new Array(9).fill(null).map(emptyRateCount);
  months.forEach((month) => {
    month.events.forEach((event) => {
      if (!predicate(event)) return;
      const row = rows[event.beforeBucket];
      row.trials += 1;
      if (event.drawn) row.hits += 1;
    });
  });
  return rows;
};

const smoothedRate = (
  hits: number,
  trials: number,
  priorRate: number,
  priorStrength: number,
): number => {
  if (trials <= 0) return priorRate;
  return (hits + priorRate * priorStrength) / (trials + priorStrength);
};

const rawRate = (hits: number, trials: number): number | null => (
  trials > 0 ? hits / trials : null
);

const globalPriorRate = (
  globalRates: readonly RateCount[],
  bucket: MonthlyTransitionBucketIndex,
): number => {
  const row = globalRates[bucket];
  if (row?.trials) return row.hits / row.trials;
  return 8 / 45;
};

const buildPlanningState = (
  latest: MonthlyBucketTransitionMonth | null,
  maxNumber: number,
): MonthlyBucketTransitionPlanningState | null => {
  if (!latest) return null;

  if (latest.drawCount >= latest.totalDrawCount) {
    const nextLabel = nextMonthLabel(latest.monthLabel) ?? latest.monthLabel;
    const expectedDrawCount = countScheduledDrawsInMonth(nextLabel) || latest.totalDrawCount;
    return {
      monthLabel: nextLabel,
      sourceMonthLabel: latest.monthLabel,
      source: "planning-reset",
      completedDrawCount: 0,
      expectedDrawCount,
      nextDrawOrdinal: 1,
      currentDistribution: [maxNumber, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  }

  return {
    monthLabel: latest.monthLabel,
    sourceMonthLabel: latest.monthLabel,
    source: "current-month",
    completedDrawCount: latest.drawCount,
    expectedDrawCount: latest.totalDrawCount,
    nextDrawOrdinal: Math.min(latest.drawCount + 1, latest.totalDrawCount),
    currentDistribution: [...latest.finalDistribution],
  };
};

const buildCurrentExpectations = (
  months: readonly MonthlyBucketTransitionMonth[],
  selectedMonthLength: MonthlyTransitionLengthFilter,
  planningState: MonthlyBucketTransitionPlanningState | null,
  globalRates: readonly RateCount[],
  priorStrength: number,
): MonthlyBucketExpectationRow[] => {
  if (!planningState) return [];
  const stageRates = aggregateBucketRates(
    months.filter((month) => monthMatchesLength(month, selectedMonthLength)),
    (event) => event.drawOrdinal === planningState.nextDrawOrdinal,
  );

  return MONTHLY_TRANSITION_BUCKET_LABELS.map((label, bucket) => {
    const bucketIndex = bucket as MonthlyTransitionBucketIndex;
    const row = stageRates[bucketIndex];
    const prior = globalPriorRate(globalRates, bucketIndex);
    const smooth = smoothedRate(row.hits, row.trials, prior, priorStrength);
    const currentCount = planningState.currentDistribution[bucketIndex] ?? 0;
    return {
      bucket: bucketIndex,
      label,
      currentCount,
      trials: row.trials,
      hits: row.hits,
      rawRate: rawRate(row.hits, row.trials),
      smoothedRate: smooth,
      expectedHits: currentCount * smooth,
    };
  });
};

const buildUndrawnSurvivalRows = (
  months: readonly MonthlyBucketTransitionMonth[],
  selectedMonthLength: MonthlyTransitionLengthFilter,
  globalRates: readonly RateCount[],
  priorStrength: number,
): MonthlyUndrawnSurvivalRow[] => {
  const selectedMonths = months.filter((month) => monthMatchesLength(month, selectedMonthLength));
  const maxDrawOrdinal = Math.max(0, ...selectedMonths.map((month) => month.drawCount));
  const rows: MonthlyUndrawnSurvivalRow[] = [];
  let estimatedSurvivalRate = 1;
  const prior = globalPriorRate(globalRates, 0);

  for (let drawOrdinal = 1; drawOrdinal <= maxDrawOrdinal; drawOrdinal += 1) {
    const stageRates = aggregateBucketRates(
      selectedMonths,
      (event) => event.drawOrdinal === drawOrdinal && event.beforeBucket === 0,
    )[0];
    const smooth = smoothedRate(stageRates.hits, stageRates.trials, prior, priorStrength);
    estimatedSurvivalRate *= (1 - smooth);
    const undrawnAfter = selectedMonths
      .map((month) => month.drawStates.find((state) => state.drawOrdinal === drawOrdinal)?.distribution[0])
      .filter((value): value is number => Number.isFinite(value));

    rows.push({
      drawOrdinal,
      monthsWithStage: undrawnAfter.length,
      trials: stageRates.trials,
      breaks: stageRates.hits,
      rawBreakRate: rawRate(stageRates.hits, stageRates.trials),
      smoothedBreakRate: smooth,
      estimatedSurvivalRate,
      medianUndrawnAfter: quantile(undrawnAfter, 0.5),
      q1UndrawnAfter: quantile(undrawnAfter, 0.25),
      q3UndrawnAfter: quantile(undrawnAfter, 0.75),
    });
  }

  return rows;
};

const buildFirstReachRows = (
  months: readonly MonthlyBucketTransitionMonth[],
  selectedMonthLength: MonthlyTransitionLengthFilter,
  planningState: MonthlyBucketTransitionPlanningState | null,
): MonthlyBucketFirstReachRow[] => {
  const selectedMonths = months.filter((month) => monthMatchesLength(month, selectedMonthLength));
  const completeMonths = selectedMonths.filter((month) => month.isComplete);
  const planningStage = planningState?.nextDrawOrdinal ?? 1;

  return ([3, 4, 5, 6, 7, 8] as MonthlyTransitionBucketIndex[]).map((bucket) => {
    const earliestDraws = selectedMonths
      .map((month) => month.drawStates.find((state) => (state.distribution[bucket] ?? 0) > 0)?.drawOrdinal ?? null);
    const reached = earliestDraws.filter((value): value is number => value !== null);
    const reachedByPlanningStage = reached.filter((drawOrdinal) => drawOrdinal <= planningStage).length;
    const monthEndValues = completeMonths.map((month) => {
      if (bucket === 6) return (month.finalDistribution[6] ?? 0);
      if (bucket === 7) return (month.finalDistribution[7] ?? 0);
      if (bucket === 8) return (month.finalDistribution[8] ?? 0);
      return month.finalDistribution[bucket] ?? 0;
    });

    return {
      bucket,
      label: MONTHLY_TRANSITION_BUCKET_LABELS[bucket],
      monthsEligible: selectedMonths.length,
      monthsReached: reached.length,
      reachedRate: selectedMonths.length ? reached.length / selectedMonths.length : 0,
      reachedByPlanningStage,
      reachedByPlanningStageRate: selectedMonths.length ? reachedByPlanningStage / selectedMonths.length : 0,
      earliestDrawMedian: quantile(reached, 0.5),
      earliestDrawQ1: quantile(reached, 0.25),
      earliestDrawQ3: quantile(reached, 0.75),
      monthEndMedianCount: quantile(monthEndValues, 0.5),
    };
  });
};

const buildMonthLengthComparisonRows = (
  months: readonly MonthlyBucketTransitionMonth[],
): MonthlyLengthComparisonRow[] => {
  const monthLengths = [...new Set(months.map((month) => month.totalDrawCount))].sort((a, b) => a - b);
  return monthLengths.map((monthLength) => {
    const lengthMonths = months.filter((month) => month.totalDrawCount === monthLength);
    const completeMonths = lengthMonths.filter((month) => month.isComplete);
    const valuesFor = (bucket: number) => completeMonths.map((month) => month.finalDistribution[bucket] ?? 0);
    const sixPlusValues = completeMonths.map((month) => (
      (month.finalDistribution[6] ?? 0)
      + (month.finalDistribution[7] ?? 0)
      + (month.finalDistribution[8] ?? 0)
    ));

    return {
      monthLength,
      months: lengthMonths.length,
      completeMonths: completeMonths.length,
      medianUndrawnEnd: quantile(valuesFor(0), 0.5),
      median1xEnd: quantile(valuesFor(1), 0.5),
      median2xEnd: quantile(valuesFor(2), 0.5),
      median3xEnd: quantile(valuesFor(3), 0.5),
      median4xEnd: quantile(valuesFor(4), 0.5),
      median5xEnd: quantile(valuesFor(5), 0.5),
      median6PlusEnd: quantile(sixPlusValues, 0.5),
    };
  });
};

const buildHeatBucketRows = (
  months: readonly MonthlyBucketTransitionMonth[],
  selectedMonthLength: MonthlyTransitionLengthFilter,
  globalRates: readonly RateCount[],
  priorStrength: number,
): MonthlyHeatBucketRow[] => {
  const rows = new Map<string, RateCount>();
  const selectedMonths = months.filter((month) => monthMatchesLength(month, selectedMonthLength));

  selectedMonths.forEach((month) => {
    month.events.forEach((event) => {
      const key = `${event.beforeBucket}:${event.priorHeatTier}`;
      const row = rows.get(key) ?? emptyRateCount();
      row.trials += 1;
      if (event.drawn) row.hits += 1;
      rows.set(key, row);
    });
  });

  const output: MonthlyHeatBucketRow[] = [];
  ([0, 1, 2, 3, 4, 5, 6, 7, 8] as MonthlyTransitionBucketIndex[]).forEach((bucket) => {
    (["cold", "middle", "hot", "flat"] as MonthlyTransitionHeatTier[]).forEach((heatTier) => {
      const row = rows.get(`${bucket}:${heatTier}`);
      if (!row || row.trials === 0) return;
      const prior = globalPriorRate(globalRates, bucket);
      output.push({
        bucket,
        label: MONTHLY_TRANSITION_BUCKET_LABELS[bucket],
        heatTier,
        trials: row.trials,
        hits: row.hits,
        rawRate: rawRate(row.hits, row.trials),
        smoothedRate: smoothedRate(row.hits, row.trials, prior, priorStrength),
      });
    });
  });

  return output;
};

export const buildMonthlyTransitionNumberContext = (
  analysis: MonthlyBucketTransitionAnalysis,
  maxNumber = DEFAULT_MAX_NUMBER,
): Map<number, MonthlyTransitionNumberContext> => {
  const result = new Map<number, MonthlyTransitionNumberContext>();
  if (!analysis.planningState || !analysis.currentExpectations.length) return result;

  const expectationByBucket = new Map(
    analysis.currentExpectations.map((row) => [row.bucket, row]),
  );
  const latestDrawStates = analysis.latestObservedMonth?.drawStates ?? [];
  const latestCounts = analysis.planningState.source === "current-month"
    ? latestDrawStates[latestDrawStates.length - 1]?.countsAfter ?? null
    : null;
  const totalCurrentCount = analysis.currentExpectations.reduce((sum, row) => sum + row.currentCount, 0);
  const totalExpectedHits = analysis.currentExpectations.reduce((sum, row) => sum + row.expectedHits, 0);
  const planningAverageRate = totalCurrentCount > 0 ? totalExpectedHits / totalCurrentCount : 0;

  for (let number = 1; number <= maxNumber; number += 1) {
    const bucket = analysis.planningState.source === "planning-reset"
      ? 0
      : bucketIndexForCount(latestCounts?.[number - 1] ?? 0);
    const expectation = expectationByBucket.get(bucket);
    if (!expectation) continue;
    const rateLift = expectation.smoothedRate - planningAverageRate;
    const support: MonthlyTransitionSupport = expectation.trials < 24
      ? "thin"
      : rateLift > 0.02
        ? "above"
        : rateLift < -0.02
          ? "below"
          : "neutral";
    result.set(number, {
      number,
      bucket,
      label: expectation.label,
      bucketCurrentCount: expectation.currentCount,
      trials: expectation.trials,
      hits: expectation.hits,
      rawRate: expectation.rawRate,
      smoothedRate: expectation.smoothedRate,
      planningAverageRate,
      rateLift,
      support,
    });
  }

  return result;
};

export const analyzeMonthlyBucketTransitions = (
  history: readonly Draw[],
  options: MonthlyBucketTransitionOptions = {},
): MonthlyBucketTransitionAnalysis => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const priorStrength = Math.max(0, options.priorStrength ?? DEFAULT_PRIOR_STRENGTH);
  const allMonths = buildMonthlyBucketTransitionMonths(history, { includeSupp, maxNumber });
  const excludedOpeningMonthLabels = getExcludedMonthLabelsForHistoryBaselines(allMonths, (month) => month.monthLabel);
  const baselineMonths = filterRowsForHistoryBaselines(allMonths, (month) => month.monthLabel);
  const latestObservedMonth = allMonths.length ? allMonths[allMonths.length - 1] : null;
  const planningState = buildPlanningState(latestObservedMonth, maxNumber);
  const monthLengthOptions = [...new Set(baselineMonths.map((month) => month.totalDrawCount))].sort((a, b) => a - b);
  const defaultMonthLength = planningState && monthLengthOptions.includes(planningState.expectedDrawCount)
    ? planningState.expectedDrawCount
    : "all";
  const selectedMonthLength = options.monthLength ?? defaultMonthLength;
  const selectedMonths = baselineMonths.filter((month) => monthMatchesLength(month, selectedMonthLength));
  const selectedCompleteMonthCount = selectedMonths.filter((month) => month.isComplete).length;
  const globalRates = aggregateBucketRates(baselineMonths, () => true);
  const warnings: string[] = [];

  if (excludedOpeningMonthLabels.length) {
    warnings.push(`Opening partial month excluded from transition baselines: ${excludedOpeningMonthLabels.join(", ")}.`);
  }
  if (selectedMonths.length < 3) {
    warnings.push("Thin transition evidence: fewer than 3 matching months. Treat smoothed rates as exploratory.");
  }
  if (selectedCompleteMonthCount < selectedMonths.length) {
    warnings.push("Incomplete current/recent months contribute only to stages already observed; month-end rows use completed months only.");
  }

  return {
    scopeLabel: includeSupp
      ? "Mains + supps, real history, opening partial month removed from baselines"
      : "Mains only, real history, opening partial month removed from baselines",
    warnings,
    excludedOpeningMonthLabels,
    allMonthCount: allMonths.length,
    baselineMonthCount: baselineMonths.length,
    selectedMonthLength,
    selectedMonthCount: selectedMonths.length,
    selectedCompleteMonthCount,
    monthLengthOptions,
    latestObservedMonth,
    planningState,
    currentExpectations: buildCurrentExpectations(
      baselineMonths,
      selectedMonthLength,
      planningState,
      globalRates,
      priorStrength,
    ),
    undrawnSurvivalRows: buildUndrawnSurvivalRows(
      baselineMonths,
      selectedMonthLength,
      globalRates,
      priorStrength,
    ),
    firstReachRows: buildFirstReachRows(baselineMonths, selectedMonthLength, planningState),
    monthLengthComparisonRows: buildMonthLengthComparisonRows(baselineMonths),
    heatBucketRows: buildHeatBucketRows(baselineMonths, selectedMonthLength, globalRates, priorStrength),
  };
};

export default analyzeMonthlyBucketTransitions;
