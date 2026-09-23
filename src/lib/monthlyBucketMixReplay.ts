import type { Draw } from "../types";
import { filterRowsForHistoryBaselines } from "./monthlyAverageScope";
import {
  analyzeMonthlyBucketMixCombinatorics,
  formatBucketMixCounts,
  type MonthlyBucketMixCounts,
} from "./monthlyBucketMixCombinatorics";
import {
  bucketKeyForTimes,
  MONTHLY_BUCKET_KEYS,
  type MonthlyBucketKey,
  type MonthlyBucketSets,
} from "./monthlyDrawSummary";

export type BucketMixReplayScope = "same-month-length" | "all-month-lengths";

export interface BucketMixReplayTrial {
  drawDate: string;
  monthLabel: string;
  drawOrdinal: number;
  monthDrawCount: number;
  actualCounts: MonthlyBucketMixCounts;
  actualRank: number;
  totalMixes: number;
  actualCombinations: bigint;
  actualShareOfAvailable: number;
  top1ShareOfAvailable: number;
  top3ShareOfAvailable: number;
  top5ShareOfAvailable: number;
}

export interface BucketMixReplayRow {
  key: string;
  drawOrdinal: number;
  monthDrawCount: number | null;
  monthLengthLabel: string;
  trials: number;
  mostCommonMix: MonthlyBucketMixCounts;
  mostCommonMixCount: number;
  mostCommonMixRate: number;
  averageActualRank: number;
  medianActualRank: number;
  top1HitRate: number;
  top3HitRate: number;
  top5HitRate: number;
  expectedTop1Rate: number;
  expectedTop3Rate: number;
  expectedTop5Rate: number;
  liftTop3: number;
  zTop3: number | null;
  pTop3: number | null;
  hasLatestDraw: boolean;
  fixedStructural: boolean;
  confidence: "fixed" | "thin" | "watch" | "usable";
}

export interface BucketMixReplayResult {
  scope: BucketMixReplayScope;
  targetMonthLabel: string;
  targetMonthDrawCount: number | null;
  baselineMonthCount: number;
  skippedDrawCount: number;
  trialCount: number;
  rows: BucketMixReplayRow[];
  latestTrial: BucketMixReplayTrial | null;
  warnings: string[];
}

interface ParsedReplayDraw {
  date: string;
  monthLabel: string;
  timestamp: number;
  numbers: number[];
}

const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_MAX_BUCKET = 8;
const DEFAULT_DRAW_SIZE = 8;
const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASH_DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/;

const emptyCounts = (): MonthlyBucketMixCounts => (
  MONTHLY_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as MonthlyBucketMixCounts)
);

const countsSignature = (counts: MonthlyBucketMixCounts): string => (
  MONTHLY_BUCKET_KEYS.map((key) => counts[key] ?? 0).join("|")
);

const compareCountsSignature = (left: MonthlyBucketMixCounts, right: MonthlyBucketMixCounts): number => (
  countsSignature(left).localeCompare(countsSignature(right))
);

const countsMatch = (left: MonthlyBucketMixCounts, right: MonthlyBucketMixCounts): boolean => (
  MONTHLY_BUCKET_KEYS.every((key) => left[key] === right[key])
);

const sumShare = (rows: readonly { shareOfAvailable: number }[], limit: number): number => (
  rows.slice(0, Math.max(0, limit)).reduce((sum, row) => sum + row.shareOfAvailable, 0)
);

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const median = (values: readonly number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-absX * absX);
  return sign * y;
};

const normalSurvival = (z: number): number => (
  0.5 * (1 - erf(z / Math.SQRT2))
);

const parseDate = (rawDate: string | undefined): { monthLabel: string; timestamp: number } | null => {
  if (!rawDate) return null;
  const isoMatch = rawDate.match(ISO_DATE_RE);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { monthLabel: `${year}-${String(month).padStart(2, "0")}`, timestamp: date.getTime() };
  }

  const slashMatch = rawDate.match(SLASH_DATE_RE);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { monthLabel: `${year}-${String(month).padStart(2, "0")}`, timestamp: date.getTime() };
  }

  const timestamp = Date.parse(rawDate);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return {
    monthLabel: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    timestamp,
  };
};

const sanitizeDrawNumbers = (
  draw: Draw,
  options: { includeSupp: boolean; maxNumber: number; drawSize: number },
): number[] | null => {
  const seen = new Set<number>();
  const rawNumbers = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(options.includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];

  for (const value of rawNumbers) {
    if (!Number.isInteger(value) || value < 1 || value > options.maxNumber || seen.has(value)) return null;
    seen.add(value);
  }

  return seen.size === options.drawSize ? [...seen].sort((left, right) => left - right) : null;
};

const parseHistory = (
  history: readonly Draw[],
  options: { includeSupp: boolean; maxNumber: number; drawSize: number },
): { parsed: ParsedReplayDraw[]; skippedDrawCount: number } => {
  const parsed: ParsedReplayDraw[] = [];
  let skippedDrawCount = 0;

  for (const draw of history) {
    if (draw.isSimulated) continue;
    const dateInfo = parseDate(draw.date);
    const numbers = sanitizeDrawNumbers(draw, options);
    if (!dateInfo || !numbers) {
      skippedDrawCount += 1;
      continue;
    }
    parsed.push({
      date: draw.date,
      monthLabel: dateInfo.monthLabel,
      timestamp: dateInfo.timestamp,
      numbers,
    });
  }

  parsed.sort((left, right) => left.timestamp - right.timestamp);
  return { parsed, skippedDrawCount };
};

const groupByMonth = (draws: readonly ParsedReplayDraw[]): Array<{ monthLabel: string; draws: ParsedReplayDraw[] }> => {
  const groups = new Map<string, ParsedReplayDraw[]>();
  for (const draw of draws) {
    const group = groups.get(draw.monthLabel);
    if (group) group.push(draw);
    else groups.set(draw.monthLabel, [draw]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthLabel, items]) => ({
      monthLabel,
      draws: [...items].sort((left, right) => left.timestamp - right.timestamp),
    }));
};

const bucketSetsFromPriorCounts = (priorCounts: readonly number[], maxNumber: number, maxBucket: number): MonthlyBucketSets => {
  const sets = MONTHLY_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = new Set<number>();
    return acc;
  }, {} as MonthlyBucketSets);

  for (let number = 1; number <= maxNumber; number += 1) {
    const times = Math.min(maxBucket, Math.max(0, Math.floor(priorCounts[number] ?? 0)));
    sets[bucketKeyForTimes(times)].add(number);
  }

  return sets;
};

const mixCountsForNumbers = (
  numbers: readonly number[],
  priorCounts: readonly number[],
  maxBucket: number,
): MonthlyBucketMixCounts => {
  const counts = emptyCounts();
  for (const number of numbers) {
    const times = Math.min(maxBucket, Math.max(0, Math.floor(priorCounts[number] ?? 0)));
    counts[bucketKeyForTimes(times)] += 1;
  }
  return counts;
};

const buildReplayTrial = (args: {
  draw: ParsedReplayDraw;
  drawOrdinal: number;
  monthDrawCount: number;
  priorCounts: readonly number[];
  maxNumber: number;
  maxBucket: number;
  drawSize: number;
}): BucketMixReplayTrial | null => {
  const actualCounts = mixCountsForNumbers(args.draw.numbers, args.priorCounts, args.maxBucket);
  const bucketSets = bucketSetsFromPriorCounts(args.priorCounts, args.maxNumber, args.maxBucket);
  const combinatorics = analyzeMonthlyBucketMixCombinatorics(bucketSets, { drawSize: args.drawSize });
  const sortedRows = [...combinatorics.rows].sort((left, right) => (
    left.actualCombinations === right.actualCombinations
      ? compareCountsSignature(left.counts, right.counts)
      : left.actualCombinations > right.actualCombinations ? -1 : 1
  ));
  const actualIndex = sortedRows.findIndex((row) => countsMatch(row.counts, actualCounts));
  if (actualIndex < 0) return null;
  const actualRow = sortedRows[actualIndex];

  return {
    drawDate: args.draw.date,
    monthLabel: args.draw.monthLabel,
    drawOrdinal: args.drawOrdinal,
    monthDrawCount: args.monthDrawCount,
    actualCounts,
    actualRank: actualIndex + 1,
    totalMixes: sortedRows.length,
    actualCombinations: actualRow.actualCombinations,
    actualShareOfAvailable: actualRow.shareOfAvailable,
    top1ShareOfAvailable: sumShare(sortedRows, 1),
    top3ShareOfAvailable: sumShare(sortedRows, 3),
    top5ShareOfAvailable: sumShare(sortedRows, 5),
  };
};

const replayMonth = (args: {
  monthLabel: string;
  draws: readonly ParsedReplayDraw[];
  monthDrawCount: number;
  maxNumber: number;
  maxBucket: number;
  drawSize: number;
}): BucketMixReplayTrial[] => {
  const priorCounts = new Array(args.maxNumber + 1).fill(0);
  const trials: BucketMixReplayTrial[] = [];

  args.draws.forEach((draw, index) => {
    const trial = buildReplayTrial({
      draw,
      drawOrdinal: index + 1,
      monthDrawCount: args.monthDrawCount,
      priorCounts,
      maxNumber: args.maxNumber,
      maxBucket: args.maxBucket,
      drawSize: args.drawSize,
    });
    if (trial) trials.push(trial);
    for (const number of draw.numbers) {
      priorCounts[number] += 1;
    }
  });

  return trials;
};

const aggregateTrials = (
  trials: readonly BucketMixReplayTrial[],
  scope: BucketMixReplayScope,
  latestTrial: BucketMixReplayTrial | null,
): BucketMixReplayRow[] => {
  const grouped = new Map<string, BucketMixReplayTrial[]>();
  for (const trial of trials) {
    const key = scope === "same-month-length"
      ? `${trial.monthDrawCount}|${trial.drawOrdinal}`
      : `all|${trial.drawOrdinal}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(trial);
    else grouped.set(key, [trial]);
  }

  return [...grouped.entries()]
    .map(([key, groupTrials]) => {
      const drawOrdinal = groupTrials[0]?.drawOrdinal ?? 0;
      const monthDrawCount = scope === "same-month-length" ? groupTrials[0]?.monthDrawCount ?? null : null;
      const actualRanks = groupTrials.map((trial) => trial.actualRank);
      const top3Successes = groupTrials.filter((trial) => trial.actualRank <= 3).length;
      const expectedTop3Total = groupTrials.reduce((sum, trial) => sum + trial.top3ShareOfAvailable, 0);
      const varianceTop3 = groupTrials.reduce((sum, trial) => (
        sum + trial.top3ShareOfAvailable * (1 - trial.top3ShareOfAvailable)
      ), 0);
      const zTop3 = varianceTop3 > 0
        ? (top3Successes - expectedTop3Total) / Math.sqrt(varianceTop3)
        : null;
      const pTop3 = zTop3 === null ? null : normalSurvival(zTop3);
      const mixCounts = new Map<string, { counts: MonthlyBucketMixCounts; count: number; shareSum: number }>();

      for (const trial of groupTrials) {
        const signature = countsSignature(trial.actualCounts);
        const current = mixCounts.get(signature);
        if (current) {
          current.count += 1;
          current.shareSum += trial.actualShareOfAvailable;
        } else {
          mixCounts.set(signature, {
            counts: trial.actualCounts,
            count: 1,
            shareSum: trial.actualShareOfAvailable,
          });
        }
      }

      const mostCommon = [...mixCounts.values()].sort((left, right) => (
        right.count - left.count ||
        right.shareSum - left.shareSum ||
        compareCountsSignature(left.counts, right.counts)
      ))[0] ?? { counts: emptyCounts(), count: 0, shareSum: 0 };
      const hasLatestDraw = !!latestTrial
        && latestTrial.drawOrdinal === drawOrdinal
        && (scope === "all-month-lengths" || latestTrial.monthDrawCount === monthDrawCount);
      const fixedStructural = drawOrdinal === 1;
      const trialsCount = groupTrials.length;

      return {
        key,
        drawOrdinal,
        monthDrawCount,
        monthLengthLabel: scope === "same-month-length" ? `${monthDrawCount ?? "?"}D` : "All",
        trials: trialsCount,
        mostCommonMix: mostCommon.counts,
        mostCommonMixCount: mostCommon.count,
        mostCommonMixRate: trialsCount ? mostCommon.count / trialsCount : 0,
        averageActualRank: mean(actualRanks),
        medianActualRank: median(actualRanks),
        top1HitRate: groupTrials.filter((trial) => trial.actualRank <= 1).length / trialsCount,
        top3HitRate: top3Successes / trialsCount,
        top5HitRate: groupTrials.filter((trial) => trial.actualRank <= 5).length / trialsCount,
        expectedTop1Rate: mean(groupTrials.map((trial) => trial.top1ShareOfAvailable)),
        expectedTop3Rate: expectedTop3Total / trialsCount,
        expectedTop5Rate: mean(groupTrials.map((trial) => trial.top5ShareOfAvailable)),
        liftTop3: (top3Successes / trialsCount) - (expectedTop3Total / trialsCount),
        zTop3,
        pTop3,
        hasLatestDraw,
        fixedStructural,
        confidence: fixedStructural ? "fixed" : trialsCount < 5 ? "thin" : trialsCount < 12 ? "watch" : "usable",
      } satisfies BucketMixReplayRow;
    })
    .sort((left, right) => (
      left.drawOrdinal - right.drawOrdinal ||
      (left.monthDrawCount ?? 0) - (right.monthDrawCount ?? 0)
    ));
};

export const analyzeMonthlyBucketMixReplay = (
  history: readonly Draw[],
  options: {
    scope?: BucketMixReplayScope;
    targetMonthLabel?: string;
    targetMonthDrawCount?: number | null;
    includeSupp?: boolean;
    maxNumber?: number;
    maxBucket?: number;
    drawSize?: number;
  } = {},
): BucketMixReplayResult => {
  const scope = options.scope ?? "same-month-length";
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const maxBucket = Math.max(1, Math.floor(options.maxBucket ?? DEFAULT_MAX_BUCKET));
  const drawSize = Math.max(1, Math.floor(options.drawSize ?? DEFAULT_DRAW_SIZE));
  const targetMonthLabel = options.targetMonthLabel ?? "";
  const targetMonthDrawCount = Number.isFinite(options.targetMonthDrawCount ?? NaN)
    ? Math.max(1, Math.floor(options.targetMonthDrawCount as number))
    : null;
  const effectiveScope: BucketMixReplayScope = scope === "same-month-length" && !targetMonthDrawCount
    ? "all-month-lengths"
    : scope;
  const warnings: string[] = [];
  const { parsed, skippedDrawCount } = parseHistory(history, { includeSupp, maxNumber, drawSize });
  const allMonthGroups = groupByMonth(parsed);

  if (!allMonthGroups.length) {
    warnings.push("No valid real draw history is available for bucket-mix replay.");
    return {
      scope: effectiveScope,
      targetMonthLabel,
      targetMonthDrawCount,
      baselineMonthCount: 0,
      skippedDrawCount,
      trialCount: 0,
      rows: [],
      latestTrial: null,
      warnings,
    };
  }

  const latestMonthGroup = allMonthGroups[allMonthGroups.length - 1];
  const latestMonthTrials = latestMonthGroup
    ? replayMonth({
      monthLabel: latestMonthGroup.monthLabel,
      draws: latestMonthGroup.draws,
      monthDrawCount: latestMonthGroup.monthLabel === targetMonthLabel && targetMonthDrawCount
        ? targetMonthDrawCount
        : latestMonthGroup.draws.length,
      maxNumber,
      maxBucket,
      drawSize,
    })
    : null;
  const latestTrial = latestMonthTrials?.length ? latestMonthTrials[latestMonthTrials.length - 1] : null;

  const baselineGroups = filterRowsForHistoryBaselines(
    targetMonthLabel
      ? allMonthGroups.filter((group) => group.monthLabel !== targetMonthLabel)
      : allMonthGroups,
    (group) => group.monthLabel,
    group => group.draws[0]?.date,
  ).filter((group) => (
    effectiveScope === "all-month-lengths" ||
    group.draws.length === targetMonthDrawCount
  ));

  if (scope === "same-month-length" && !targetMonthDrawCount) {
    warnings.push("Same-month-length replay has no resolved target month length, so all baseline month lengths were pooled.");
  }
  if (skippedDrawCount > 0) {
    warnings.push(`${skippedDrawCount} invalid, duplicate, or incomplete draw ${skippedDrawCount === 1 ? "row was" : "rows were"} skipped before replay.`);
  }

  const trials = baselineGroups.flatMap((group) => replayMonth({
    monthLabel: group.monthLabel,
    draws: group.draws,
    monthDrawCount: group.draws.length,
    maxNumber,
    maxBucket,
    drawSize,
  }));
  const rows = aggregateTrials(trials, effectiveScope, latestTrial);

  if (!rows.length) {
    warnings.push("No replay rows are available for the selected baseline scope.");
  }

  return {
    scope: effectiveScope,
    targetMonthLabel,
    targetMonthDrawCount,
    baselineMonthCount: baselineGroups.length,
    skippedDrawCount,
    trialCount: trials.length,
    rows,
    latestTrial,
    warnings,
  };
};

export const bucketMixReplayRowSummary = (row: BucketMixReplayRow): string => (
  `${row.monthLengthLabel} D${row.drawOrdinal}: ${formatBucketMixCounts(row.mostCommonMix)}`
);
