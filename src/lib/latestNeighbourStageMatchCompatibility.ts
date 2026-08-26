import type { Draw } from "../types";
import {
  analyzeLatestNeighbourSupport,
  type LatestNeighbourSupportOptions,
} from "./latestNeighbourSupport";
import type {
  MonthlyBucketKey,
  MonthlyBucketSets,
  MonthlyFrequencyConstraints,
} from "./monthlyDrawSummary";

const CANDIDATE_NUMBER_COUNT = 8;
const MONTHLY_KEYS: MonthlyBucketKey[] = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
];

const MONTHLY_LABELS: Record<MonthlyBucketKey, string> = {
  undrawn: "0x",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};

export interface LatestNeighbourStageMatchCompatibilityOptions {
  enabled: boolean;
  history: Draw[];
  analysisBuckets?: MonthlyBucketSets | null;
  compatibilityBuckets?: MonthlyBucketSets | null;
  counts?: MonthlyFrequencyConstraints | null;
  countSourceLabel: string;
  excludedNumbers?: readonly number[];
  planningLastDrawOverride?: boolean;
  terminalRuleActive?: LatestNeighbourSupportOptions["terminalRuleActive"];
}

export interface LatestNeighbourStageMatchCompatibilityResult {
  traceLine: string | null;
  compatible: "yes" | "no" | "unknown";
  eligibleTargetCount: number;
  bucketCoverage: Partial<Record<MonthlyBucketKey, number>>;
}

const zeroCoverage = (): Record<MonthlyBucketKey, number> => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
});

const totalCounts = (counts: MonthlyFrequencyConstraints): number => (
  MONTHLY_KEYS.reduce((sum, key) => sum + Math.max(0, counts[key] ?? 0), 0)
);

const hasPositiveCounts = (counts: MonthlyFrequencyConstraints): boolean => (
  MONTHLY_KEYS.some((key) => (counts[key] ?? 0) > 0)
);

const bucketKeyForNumber = (
  number: number,
  buckets: MonthlyBucketSets,
): MonthlyBucketKey | null => {
  for (const key of MONTHLY_KEYS) {
    if (buckets[key].has(number)) return key;
  }
  return null;
};

const formatCoverage = (coverage: Partial<Record<MonthlyBucketKey, number>>, unknownCount: number): string => {
  const parts = MONTHLY_KEYS
    .map((key) => [key, coverage[key] ?? 0] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${MONTHLY_LABELS[key]}:${count}`);
  if (unknownCount > 0) parts.push(`unknown:${unknownCount}`);
  return parts.length ? parts.join(" ") : "none";
};

const formatCounts = (counts: MonthlyFrequencyConstraints): string => {
  const parts = MONTHLY_KEYS
    .map((key) => [key, Math.max(0, counts[key] ?? 0)] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${MONTHLY_LABELS[key]}>=${count}`);
  return parts.length ? parts.join(" ") : "none";
};

export function buildLatestNeighbourStageMatchCompatibilityTrace(
  options: LatestNeighbourStageMatchCompatibilityOptions,
): LatestNeighbourStageMatchCompatibilityResult {
  const emptyResult: LatestNeighbourStageMatchCompatibilityResult = {
    traceLine: null,
    compatible: "unknown",
    eligibleTargetCount: 0,
    bucketCoverage: {},
  };
  if (!options.enabled || !options.counts) return emptyResult;

  const analysis = analyzeLatestNeighbourSupport(options.history, options.analysisBuckets, {
    enabled: true,
    excludedNumbers: options.excludedNumbers,
    planningLastDrawOverride: options.planningLastDrawOverride,
    terminalRuleActive: options.terminalRuleActive,
  });
  const activeCounts = options.counts;
  const requiredTotal = totalCounts(activeCounts);
  const source = options.countSourceLabel.trim() || "active counts";
  const countText = formatCounts(activeCounts);
  const prefix = `LD±1 + Stage-Match compatibility: ${analysis.targetNumbers.length} eligible +/-1 target${analysis.targetNumbers.length === 1 ? "" : "s"}`;

  if (!hasPositiveCounts(activeCounts)) {
    return {
      traceLine: `[TRACE] ${prefix}; bucket coverage n/a; active counts none (${source}); compatible: yes (no active bucket-count requirements).`,
      compatible: "yes",
      eligibleTargetCount: analysis.targetNumbers.length,
      bucketCoverage: {},
    };
  }

  if (!analysis.active) {
    return {
      traceLine: `[TRACE] ${prefix}; bucket coverage none; active counts ${countText} (${source}); compatible: no (no eligible LD±1 targets remained).`,
      compatible: "no",
      eligibleTargetCount: 0,
      bucketCoverage: {},
    };
  }

  if (requiredTotal > CANDIDATE_NUMBER_COUNT) {
    return {
      traceLine: `[TRACE] ${prefix}; bucket coverage not checked; active counts ${countText} (${source}); compatible: no (requirements total ${requiredTotal}, candidate has ${CANDIDATE_NUMBER_COUNT} numbers).`,
      compatible: "no",
      eligibleTargetCount: analysis.targetNumbers.length,
      bucketCoverage: {},
    };
  }

  const compatibilityBuckets = options.compatibilityBuckets ?? null;
  if (!compatibilityBuckets) {
    return {
      traceLine: `[TRACE] ${prefix}; bucket coverage unknown; active counts ${countText} (${source}); compatible: unknown (Acceptance Needs bucket state unavailable).`,
      compatible: "unknown",
      eligibleTargetCount: analysis.targetNumbers.length,
      bucketCoverage: {},
    };
  }

  const coverage = zeroCoverage();
  let unknownCount = 0;
  let eligibleInRequiredBucket = false;
  for (const target of analysis.targetNumbers) {
    const bucketKey = bucketKeyForNumber(target, compatibilityBuckets);
    if (!bucketKey) {
      unknownCount += 1;
      continue;
    }
    coverage[bucketKey] += 1;
    if ((activeCounts[bucketKey] ?? 0) > 0) eligibleInRequiredBucket = true;
  }

  const spareSlots = CANDIDATE_NUMBER_COUNT - requiredTotal;
  const compatible = spareSlots > 0 || eligibleInRequiredBucket;
  const reason = compatible
    ? spareSlots > 0
      ? `${spareSlots} spare slot${spareSlots === 1 ? "" : "s"} outside required bucket minimums`
      : "at least one eligible LD±1 target is inside a required bucket"
    : "all 8 slots are claimed by bucket counts, and no eligible LD±1 target is inside a required bucket";

  return {
    traceLine: `[TRACE] ${prefix}; bucket coverage ${formatCoverage(coverage, unknownCount)}; active counts ${countText} (${source}); compatible: ${compatible ? "yes" : "no"} (${reason}).`,
    compatible: compatible ? "yes" : "no",
    eligibleTargetCount: analysis.targetNumbers.length,
    bucketCoverage: coverage,
  };
}
