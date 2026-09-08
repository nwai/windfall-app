import type { Draw } from "../types";
import {
  bucketLabelForTimes,
  MONTHLY_BUCKET_KEYS,
  type MonthlyBucketKey,
  type MonthlyBucketSets,
  type MonthlyFrequencyConstraints,
  type StageMatchAcceptancePlaybookRow,
} from "./monthlyDrawSummary";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export type MonthlyBucketMixCounts = Record<MonthlyBucketKey, number>;

export interface MonthlyBucketMixCombinatoricsRow {
  counts: MonthlyBucketMixCounts;
  actualCombinations: bigint;
  shareOfAvailable: number;
  meetsAcceptanceNeeds: boolean | null;
  acceptanceNeedsShortfall: MonthlyBucketKey[];
  stageMatchSupportCount: number;
  stageMatchLabels: string[];
}

export interface MonthlyBucketMixCombinatoricsResult {
  bucketSizes: MonthlyBucketMixCounts;
  visibleBucketKeys: MonthlyBucketKey[];
  rows: MonthlyBucketMixCombinatoricsRow[];
  totalCombinations: bigint;
  totalMixes: number;
  drawSize: number;
  acceptanceNeedsActive: boolean;
}

export interface LatestDrawBucketOriginMix {
  drawDate: string;
  monthLabel: string;
  drawNumbers: number[];
  counts: MonthlyBucketMixCounts;
  warnings: string[];
}

const DEFAULT_DRAW_SIZE = 8;
const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_MAX_BUCKET = 8;

const emptyCounts = (): MonthlyBucketMixCounts => (
  MONTHLY_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as MonthlyBucketMixCounts)
);

const sanitizeNumbers = (
  draw: Draw,
  includeSupp: boolean,
  maxNumber: number,
): { numbers: number[]; invalidCount: number; duplicateCount: number } => {
  const seen = new Set<number>();
  let invalidCount = 0;
  let duplicateCount = 0;
  const rawNumbers = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];

  for (const value of rawNumbers) {
    if (!Number.isInteger(value) || value < 1 || value > maxNumber) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(value)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(value);
  }

  return {
    numbers: [...seen].sort((left, right) => left - right),
    invalidCount,
    duplicateCount,
  };
};

const monthLabelForDate = (dateText: string): string | null => {
  const timestamp = parseDrawDateToEpoch(dateText);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const chooseBigInt = (n: number, k: number): bigint => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0n;
  const limit = Math.min(k, n - k);
  let result = 1n;
  for (let i = 1; i <= limit; i += 1) {
    result = (result * BigInt(n - limit + i)) / BigInt(i);
  }
  return result;
};

export const formatBigInt = (value: bigint): string => (
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
);

export const formatBucketMixCounts = (
  counts: MonthlyBucketMixCounts,
  keys: readonly MonthlyBucketKey[] = MONTHLY_BUCKET_KEYS,
): string => (
  keys
    .map((key) => `${bucketLabelForTimes(MONTHLY_BUCKET_KEYS.indexOf(key))} ${counts[key] ?? 0}`)
    .join(", ")
);

const countsSignature = (counts: MonthlyBucketMixCounts): string => (
  MONTHLY_BUCKET_KEYS.map((key) => counts[key] ?? 0).join("|")
);

const countsFromArray = (values: readonly number[]): MonthlyBucketMixCounts => {
  const counts = emptyCounts();
  MONTHLY_BUCKET_KEYS.forEach((key, index) => {
    counts[key] = Math.max(0, Math.floor(values[index] ?? 0));
  });
  return counts;
};

const bucketKeyForCount = (count: number): MonthlyBucketKey => {
  if (count <= 0) return "undrawn";
  if (count >= DEFAULT_MAX_BUCKET) return "times8";
  return `times${count}` as MonthlyBucketKey;
};

export const analyzeMonthlyBucketMixCombinatorics = (
  bucketSets: MonthlyBucketSets,
  options: {
    drawSize?: number;
    acceptanceNeeds?: MonthlyFrequencyConstraints | null;
    stageMatchRows?: readonly Pick<StageMatchAcceptancePlaybookRow, "acceptanceNeedsBucketCounts" | "historicalMonthLabel" | "targetUndrawnCount" | "variantRank">[] | null;
  } = {},
): MonthlyBucketMixCombinatoricsResult => {
  const drawSize = Math.max(0, Math.floor(options.drawSize ?? DEFAULT_DRAW_SIZE));
  const bucketSizes = emptyCounts();
  for (const key of MONTHLY_BUCKET_KEYS) {
    bucketSizes[key] = bucketSets[key]?.size ?? 0;
  }
  const visibleBucketKeys = MONTHLY_BUCKET_KEYS.filter((key) => bucketSizes[key] > 0);
  const acceptanceNeeds = options.acceptanceNeeds ?? null;
  const acceptanceNeedsActive = !!acceptanceNeeds && MONTHLY_BUCKET_KEYS.some((key) => acceptanceNeeds[key] > 0);
  const stageMatchesBySignature = new Map<string, string[]>();

  for (const stageRow of options.stageMatchRows ?? []) {
    const stageCounts = countsFromArray(stageRow.acceptanceNeedsBucketCounts);
    const signature = countsSignature(stageCounts);
    const labels = stageMatchesBySignature.get(signature) ?? [];
    labels.push(`${stageRow.historicalMonthLabel} U${stageRow.targetUndrawnCount} #${stageRow.variantRank}`);
    stageMatchesBySignature.set(signature, labels);
  }

  const rows: MonthlyBucketMixCombinatoricsRow[] = [];
  const working = emptyCounts();

  const search = (bucketIndex: number, remaining: number) => {
    if (bucketIndex === MONTHLY_BUCKET_KEYS.length) {
      if (remaining !== 0) return;

      const counts = { ...working };
      let actualCombinations = 1n;
      for (const key of MONTHLY_BUCKET_KEYS) {
        actualCombinations *= chooseBigInt(bucketSizes[key], counts[key]);
      }
      if (actualCombinations <= 0n) return;

      const acceptanceNeedsShortfall = acceptanceNeedsActive && acceptanceNeeds
        ? MONTHLY_BUCKET_KEYS.filter((key) => counts[key] < acceptanceNeeds[key])
        : [];
      const stageMatchLabels = stageMatchesBySignature.get(countsSignature(counts)) ?? [];

      rows.push({
        counts,
        actualCombinations,
        shareOfAvailable: 0,
        meetsAcceptanceNeeds: acceptanceNeedsActive ? acceptanceNeedsShortfall.length === 0 : null,
        acceptanceNeedsShortfall,
        stageMatchSupportCount: stageMatchLabels.length,
        stageMatchLabels,
      });
      return;
    }

    const key = MONTHLY_BUCKET_KEYS[bucketIndex];
    const maxCount = Math.min(remaining, bucketSizes[key]);
    for (let count = 0; count <= maxCount; count += 1) {
      working[key] = count;
      search(bucketIndex + 1, remaining - count);
    }
    working[key] = 0;
  };

  search(0, drawSize);

  const totalCombinations = rows.reduce((sum, row) => sum + row.actualCombinations, 0n);
  const denominator = Number(totalCombinations);
  const rowsWithShare = rows.map((row) => ({
    ...row,
    shareOfAvailable: denominator > 0 ? Number(row.actualCombinations) / denominator : 0,
  }));

  return {
    bucketSizes,
    visibleBucketKeys,
    rows: rowsWithShare,
    totalCombinations,
    totalMixes: rowsWithShare.length,
    drawSize,
    acceptanceNeedsActive,
  };
};

export const getLatestDrawBucketOriginMix = (
  history: Draw[],
  options: { includeSupp?: boolean; maxNumber?: number; maxBucket?: number; drawSize?: number } = {},
): LatestDrawBucketOriginMix | null => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const maxBucket = Math.max(1, Math.floor(options.maxBucket ?? DEFAULT_MAX_BUCKET));
  const drawSize = Math.max(1, Math.floor(options.drawSize ?? DEFAULT_DRAW_SIZE));
  const chrono = sortDrawsChronologically(history)
    .filter((draw) => !!monthLabelForDate(draw.date));
  if (!chrono.length) return null;

  const latest = chrono[chrono.length - 1];
  const latestMonthLabel = monthLabelForDate(latest.date);
  if (!latestMonthLabel) return null;

  const latestNumbers = sanitizeNumbers(latest, includeSupp, maxNumber);
  const priorCounts = new Array(maxNumber + 1).fill(0);
  for (const draw of chrono.slice(0, -1)) {
    if (monthLabelForDate(draw.date) !== latestMonthLabel) continue;
    const sanitized = sanitizeNumbers(draw, includeSupp, maxNumber);
    for (const number of sanitized.numbers) {
      priorCounts[number] += 1;
    }
  }

  const counts = emptyCounts();
  for (const number of latestNumbers.numbers) {
    const priorCount = Math.min(maxBucket, priorCounts[number] ?? 0);
    counts[bucketKeyForCount(priorCount)] += 1;
  }

  const warnings: string[] = [];
  if (latestNumbers.numbers.length !== drawSize) {
    warnings.push(`Latest draw contributed ${latestNumbers.numbers.length} unique number${latestNumbers.numbers.length === 1 ? "" : "s"}; expected ${drawSize}.`);
  }
  if (latestNumbers.invalidCount > 0) {
    warnings.push(`${latestNumbers.invalidCount} invalid latest-draw number${latestNumbers.invalidCount === 1 ? "" : "s"} ignored.`);
  }
  if (latestNumbers.duplicateCount > 0) {
    warnings.push(`${latestNumbers.duplicateCount} duplicate latest-draw number${latestNumbers.duplicateCount === 1 ? "" : "s"} counted once.`);
  }

  return {
    drawDate: latest.date,
    monthLabel: latestMonthLabel,
    drawNumbers: latestNumbers.numbers,
    counts,
    warnings,
  };
};
