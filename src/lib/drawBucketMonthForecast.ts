import type { Draw } from "../types";
import { analyzeEndingDigitSequences } from "./endingDigitSequences";
import { analyzeMonthlyDigitOccurrences } from "./monthlyDigitOccurrences";
import {
  DEFAULT_DRAW_BUCKETS,
  getDrawMonthKey,
  type DrawBucketDefinition,
} from "./drawBucketPatterns";

export interface ForecastTopMatch {
  monthKey: string;
  targetDate: string;
  distance: number;
  hits: number;
}

export interface BucketHitForecast {
  bucketKey: string;
  slotIndex: number;
  predictedHits: number;
  expectedHits: number;
  confidence: number;
  support: number;
  topMatches: ForecastTopMatch[];
  drivers: string[];
}

export interface SlotForecast {
  slotIndex: number;
  bucketForecasts: Record<string, BucketHitForecast>;
}

export interface DrawBucketMonthForecastResult {
  currentMonthKey: string | null;
  observedDrawCount: number;
  targetSlotCount: number;
  forecastSlotCount: number;
  slotForecasts: SlotForecast[];
}

export interface ForecastDrawBucketMonthOptions {
  includeSupp?: boolean;
  targetSlotCount: number;
  currentMonthKey?: string | null;
  buckets?: DrawBucketDefinition[];
  topMatchCount?: number;
}

interface NormalizedDraw {
  date: string;
  time: number;
  monthKey: string;
  main: number[];
  supp: number[];
}

interface MonthEntry {
  key: string;
  draws: Draw[];
}

interface MonthProgressFeatures {
  undrawnCount: number;
  times1Count: number;
  times2Count: number;
  times3Count: number;
  times4PlusCount: number;
  repeatedNumberCount: number;
  seenNumberCount: number;
  averageSeenFrequency: number;
  lastOverlapShare: number;
  averageOverlapShare: number;
  lastRunLength: number;
  lastCoveredShare: number;
  averageRunLength: number;
  averageCoveredShare: number;
  oneDigitShare: number;
  widthBiasGap: number;
  oneDigitBiasScore: number;
  activeRunDigits: number[];
}

interface ForecastExample {
  monthKey: string;
  targetDate: string;
  features: MonthProgressFeatures;
  targetHitsByBucket: Record<string, number>;
}

const MAX_NUMBER = 45;

const parseDateSafe = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeHistory = (history: Draw[]): NormalizedDraw[] => {
  return history
    .map((draw) => {
      const time = parseDateSafe(draw.date || "");
      const monthKey = getDrawMonthKey(draw.date || "");
      if (time === null || !monthKey) {
        return null;
      }
      return {
        date: draw.date,
        time,
        monthKey,
        main: [...draw.main],
        supp: [...draw.supp],
      };
    })
    .filter((draw): draw is NormalizedDraw => draw !== null)
    .sort((left, right) => left.time - right.time);
};

const groupDrawsByMonth = (history: Draw[]): MonthEntry[] => {
  const normalized = normalizeHistory(history);
  const byMonth = new Map<string, Draw[]>();
  normalized.forEach((draw) => {
    if (!byMonth.has(draw.monthKey)) {
      byMonth.set(draw.monthKey, []);
    }
    byMonth.get(draw.monthKey)?.push({
      date: draw.date,
      main: draw.main,
      supp: draw.supp,
    });
  });

  return Array.from(byMonth.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, draws]) => ({ key, draws }));
};

const getPool = (draw: Draw, includeSupp: boolean): number[] => (
  includeSupp ? [...draw.main, ...draw.supp] : [...draw.main]
);

const computeBucketHitsForDraw = (
  draw: Draw,
  bucket: DrawBucketDefinition,
  includeSupp: boolean,
): number => {
  const bucketSet = new Set(bucket.numbers);
  return getPool(draw, includeSupp).filter((value) => bucketSet.has(value)).length;
};

const computeFrequencyCounts = (draws: Draw[], includeSupp: boolean): number[] => {
  const counts = Array<number>(MAX_NUMBER + 1).fill(0);
  draws.forEach((draw) => {
    getPool(draw, includeSupp).forEach((value) => {
      if (Number.isInteger(value) && value >= 1 && value <= MAX_NUMBER) {
        counts[value] += 1;
      }
    });
  });
  return counts;
};

const computeOverlapShares = (draws: Draw[], includeSupp: boolean): number[] => {
  const shares: number[] = [];
  const seen = new Set<number>();

  draws.forEach((draw, index) => {
    const uniquePool = Array.from(new Set(getPool(draw, includeSupp)));
    if (index === 0) {
      uniquePool.forEach((value) => seen.add(value));
      return;
    }
    const overlaps = uniquePool.filter((value) => seen.has(value)).length;
    shares.push(uniquePool.length > 0 ? overlaps / uniquePool.length : 0);
    uniquePool.forEach((value) => seen.add(value));
  });

  return shares;
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildMonthProgressFeatures = (
  monthDraws: Draw[],
  includeSupp: boolean,
  referenceHistory: Draw[],
): MonthProgressFeatures => {
  const counts = computeFrequencyCounts(monthDraws, includeSupp);
  const positiveCounts = counts.slice(1).filter((count) => count > 0);
  const oneDigitCount = monthDraws.reduce((sum, draw) => (
    sum + getPool(draw, includeSupp).filter((value) => value >= 1 && value <= 9).length
  ), 0);
  const totalCount = monthDraws.reduce((sum, draw) => sum + getPool(draw, includeSupp).length, 0);

  const monthlyDigitSummary = analyzeMonthlyDigitOccurrences(referenceHistory, { includeSupp });
  const baselineOneDigitShare = monthlyDigitSummary.totalOccurrences > 0
    ? monthlyDigitSummary.totalOneDigitOccurrences / monthlyDigitSummary.totalOccurrences
    : 0;
  const oneDigitShare = totalCount > 0 ? oneDigitCount / totalCount : 0;

  const endingSummary = analyzeEndingDigitSequences(monthDraws, { includeSupp });
  const lastDrawStats = endingSummary.perDraw[endingSummary.perDraw.length - 1];
  const strongestRunDigits = lastDrawStats?.maxRuns[0]?.digits ?? [];
  const overlapShares = computeOverlapShares(monthDraws, includeSupp);

  return {
    undrawnCount: counts.slice(1).filter((count) => count === 0).length,
    times1Count: counts.slice(1).filter((count) => count === 1).length,
    times2Count: counts.slice(1).filter((count) => count === 2).length,
    times3Count: counts.slice(1).filter((count) => count === 3).length,
    times4PlusCount: counts.slice(1).filter((count) => count >= 4).length,
    repeatedNumberCount: counts.slice(1).filter((count) => count >= 2).length,
    seenNumberCount: positiveCounts.length,
    averageSeenFrequency: average(positiveCounts),
    lastOverlapShare: overlapShares[overlapShares.length - 1] ?? 0,
    averageOverlapShare: average(overlapShares),
    lastRunLength: lastDrawStats?.maxRunLength ?? 0,
    lastCoveredShare: totalCount > 0 && lastDrawStats
      ? lastDrawStats.coveredNumbers / Math.max(1, getPool(monthDraws[monthDraws.length - 1], includeSupp).length)
      : 0,
    averageRunLength: average(endingSummary.perDraw.map((draw) => draw.maxRunLength)),
    averageCoveredShare: average(
      endingSummary.perDraw.map((draw) => draw.coveredNumbers / Math.max(1, draw.numbers.length)),
    ),
    oneDigitShare,
    widthBiasGap: oneDigitShare - baselineOneDigitShare,
    oneDigitBiasScore: monthlyDigitSummary.recentBias.direction === "insufficientHistory"
      ? 0
      : monthlyDigitSummary.recentBias.oneDigitBiasScore,
    activeRunDigits: strongestRunDigits,
  };
};

const featureDistance = (left: MonthProgressFeatures, right: MonthProgressFeatures): number => {
  const contributions = [
    (Math.abs(left.undrawnCount - right.undrawnCount) / 45) * 0.17,
    (Math.abs(left.times1Count - right.times1Count) / 45) * 0.11,
    (Math.abs(left.times2Count - right.times2Count) / 45) * 0.09,
    (Math.abs(left.times3Count - right.times3Count) / 45) * 0.06,
    (Math.abs(left.times4PlusCount - right.times4PlusCount) / 45) * 0.05,
    (Math.abs(left.repeatedNumberCount - right.repeatedNumberCount) / 45) * 0.08,
    (Math.abs(left.seenNumberCount - right.seenNumberCount) / 45) * 0.07,
    Math.abs(left.averageSeenFrequency - right.averageSeenFrequency) * 0.05,
    Math.abs(left.lastOverlapShare - right.lastOverlapShare) * 0.08,
    Math.abs(left.averageOverlapShare - right.averageOverlapShare) * 0.07,
    (Math.abs(left.lastRunLength - right.lastRunLength) / 8) * 0.08,
    Math.abs(left.lastCoveredShare - right.lastCoveredShare) * 0.08,
    (Math.abs(left.averageRunLength - right.averageRunLength) / 8) * 0.04,
    Math.abs(left.averageCoveredShare - right.averageCoveredShare) * 0.04,
    Math.abs(left.oneDigitShare - right.oneDigitShare) * 0.08,
    Math.abs(left.widthBiasGap - right.widthBiasGap) * 0.08,
    Math.abs(left.oneDigitBiasScore - right.oneDigitBiasScore) * 0.05,
  ];

  return contributions.reduce((sum, value) => sum + value, 0);
};

const buildDrivers = (
  currentFeatures: MonthProgressFeatures,
  bucket: DrawBucketDefinition,
  includeSupp: boolean,
  slotIndex: number,
): string[] => {
  const drivers: string[] = [];
  const bucketOneDigitCount = bucket.numbers.filter((value) => value >= 1 && value <= 9).length;
  const bucketTwoDigitCount = bucket.numbers.filter((value) => value >= 10 && value <= 45).length;
  const activeRunDigitSet = new Set(currentFeatures.activeRunDigits);
  const bucketEndingDigits = new Set(bucket.numbers.map((value) => value % 10));
  const hasRunAlignment = Array.from(bucketEndingDigits).some((digit) => activeRunDigitSet.has(digit));

  if (currentFeatures.widthBiasGap >= 0.05 && bucketOneDigitCount > 0) {
    drivers.push("current month is running more single-digit-heavy than baseline");
  }
  if (currentFeatures.widthBiasGap <= -0.05 && bucketTwoDigitCount > 0) {
    drivers.push("current month is running more two-digit-heavy than baseline");
  }
  if (currentFeatures.lastRunLength >= 3 && hasRunAlignment) {
    drivers.push("active ending-digit sequence pressure overlaps this bucket");
  }
  if (currentFeatures.lastOverlapShare >= 0.33) {
    drivers.push("recent month overlap pressure is elevated");
  }
  if (currentFeatures.undrawnCount >= 28) {
    drivers.push("many numbers remain undrawn in the month so far");
  }
  if (currentFeatures.repeatedNumberCount >= 10) {
    drivers.push("month-to-date repeat frequency is already elevated");
  }
  if (slotIndex >= 5 && includeSupp) {
    drivers.push("later month slots often become more volatile with main + supp included");
  }

  return drivers.slice(0, 3);
};

const buildExamplesForSlot = (
  historyMonths: MonthEntry[],
  conditioningDrawCount: number,
  slotIndex: number,
  includeSupp: boolean,
  referenceHistory: Draw[],
  buckets: DrawBucketDefinition[],
): ForecastExample[] => {
  return historyMonths
    .filter((month) => month.draws.length >= Math.max(conditioningDrawCount, slotIndex))
    .map((month) => {
      const prefix = month.draws.slice(0, conditioningDrawCount);
      const targetDraw = month.draws[slotIndex - 1];
      const targetHitsByBucket = Object.fromEntries(
        buckets.map((bucket) => [bucket.key, computeBucketHitsForDraw(targetDraw, bucket, includeSupp)]),
      );

      return {
        monthKey: month.key,
        targetDate: targetDraw.date,
        features: buildMonthProgressFeatures(prefix, includeSupp, referenceHistory),
        targetHitsByBucket,
      };
    });
};

export const forecastDrawBucketMonth = (
  history: Draw[],
  options: ForecastDrawBucketMonthOptions,
): DrawBucketMonthForecastResult => {
  const {
    includeSupp = true,
    targetSlotCount,
    currentMonthKey,
    buckets = DEFAULT_DRAW_BUCKETS,
    topMatchCount = 3,
  } = options;

  const months = groupDrawsByMonth(history);
  const inferredCurrentMonthKey = currentMonthKey ?? months[months.length - 1]?.key ?? null;
  const currentMonth = inferredCurrentMonthKey
    ? months.find((month) => month.key === inferredCurrentMonthKey) ?? null
    : null;

  if (!currentMonth || targetSlotCount <= 0) {
    return {
      currentMonthKey: inferredCurrentMonthKey,
      observedDrawCount: currentMonth?.draws.length ?? 0,
      targetSlotCount: Math.max(0, targetSlotCount),
      forecastSlotCount: 0,
      slotForecasts: [],
    };
  }

  const conditioningDrawCount = Math.min(currentMonth.draws.length, targetSlotCount);
  const forecastSlotIndices = Array.from(
    { length: Math.max(0, targetSlotCount - conditioningDrawCount) },
    (_, index) => conditioningDrawCount + index + 1,
  );

  const trainingMonths = months.filter((month) => month.key !== currentMonth.key);
  const trainingHistory = trainingMonths.flatMap((month) => month.draws);
  const referenceHistory = trainingHistory.length > 0 ? trainingHistory : history;
  const currentFeatures = buildMonthProgressFeatures(
    currentMonth.draws.slice(0, conditioningDrawCount),
    includeSupp,
    referenceHistory,
  );

  const slotForecasts = forecastSlotIndices.map<SlotForecast>((slotIndex) => {
    const examples = buildExamplesForSlot(
      trainingMonths,
      conditioningDrawCount,
      slotIndex,
      includeSupp,
      referenceHistory,
      buckets,
    );

    const rankedExamples = examples
      .map((example) => ({
        ...example,
        distance: featureDistance(currentFeatures, example.features),
      }))
      .sort((left, right) => left.distance - right.distance);

    const weightedExamples = rankedExamples.map((example) => ({
      ...example,
      weight: 1 / (1 + Math.pow(example.distance * 6, 2)),
    }));

    const bucketForecasts = Object.fromEntries(
      buckets.map((bucket) => {
        const weightedCounts = new Map<number, number>();
        let totalWeight = 0;
        let weightedHitSum = 0;

        weightedExamples.forEach((example) => {
          const hits = example.targetHitsByBucket[bucket.key] ?? 0;
          totalWeight += example.weight;
          weightedHitSum += example.weight * hits;
          weightedCounts.set(hits, (weightedCounts.get(hits) ?? 0) + example.weight);
        });

        const rankedHitWeights = Array.from(weightedCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
        const predictedHits = rankedHitWeights[0]?.[0] ?? 0;
        const confidence = totalWeight > 0 ? (rankedHitWeights[0]?.[1] ?? 0) / totalWeight : 0;
        const topMatches = rankedExamples.slice(0, topMatchCount).map((example) => ({
          monthKey: example.monthKey,
          targetDate: example.targetDate,
          distance: example.distance,
          hits: example.targetHitsByBucket[bucket.key] ?? 0,
        }));

        const forecast: BucketHitForecast = {
          bucketKey: bucket.key,
          slotIndex,
          predictedHits,
          expectedHits: totalWeight > 0 ? weightedHitSum / totalWeight : 0,
          confidence,
          support: rankedExamples.length,
          topMatches,
          drivers: buildDrivers(currentFeatures, bucket, includeSupp, slotIndex),
        };

        return [bucket.key, forecast];
      }),
    );

    return {
      slotIndex,
      bucketForecasts,
    };
  });

  return {
    currentMonthKey: currentMonth.key,
    observedDrawCount: conditioningDrawCount,
    targetSlotCount,
    forecastSlotCount: slotForecasts.length,
    slotForecasts,
  };
};
