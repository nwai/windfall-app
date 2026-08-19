import type { Draw } from "../types";
import { filterRowsForHistoryBaselines } from "./monthlyAverageScope";

export const MONTHLY_BUCKET_KEYS = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
] as const;

export type MonthlyBucketKey = typeof MONTHLY_BUCKET_KEYS[number];

export interface MonthlyFrequencyConstraints {
  undrawn: number;
  times1: number;
  times2: number;
  times3: number;
  times4: number;
  times5: number;
  times6: number;
  times7: number;
  times8: number;
}

export type MonthlyBucketSets = Record<MonthlyBucketKey, Set<number>>;
export type MonthlyBucketSelections = Record<MonthlyBucketKey, number[]>;

export interface MonthlyBucketProjectionEntry {
  baseCount: number;
  projectedCount: number;
  delta: number;
  selectedCount: number;
}

export type MonthlyBucketProjectionMap = Record<MonthlyBucketKey, MonthlyBucketProjectionEntry>;

export interface MonthlyConstraintPayload {
  constraints: MonthlyFrequencyConstraints;
  buckets: MonthlyBucketSets;
  boostPenalize?: boolean;
  selectedNumbersByBucket?: MonthlyBucketSelections;
  selectedNumberBiasEnabled?: boolean;
}

export interface MonthlyNumberCount {
  n: number;
  c: number;
}

export interface MonthlyFrequencyCount {
  times: number;
  count: number;
}

export interface MonthlyDrawMonthRow {
  monthLabel: string;
  drawCount: number;
  totalDrawCount: number;
  numbers: MonthlyNumberCount[];
  frequencyCounts: MonthlyFrequencyCount[];
  undrawn: number[];
  distribution: number[];
  validNumberOccurrences: number;
  expectedNumberSlots: number;
  ignoredNumberEntries: number;
}

export interface AvgBucketEntry {
  times: number;
  avg: number;
}

export interface MonthlyBucketTarget extends AvgBucketEntry {
  median: number;
  q1: number;
  q3: number;
  targetCount: number;
  currentCount: number;
  neededDelta: number;
}

export interface IdealMonthlyDraw {
  bucketCounts: MonthlyFrequencyCount[];
  projectedDistribution: number[];
  freePicks: number;
  scoreBefore: number;
  scoreAfter: number;
  exactBucketHits: number;
}

export interface MonthlyDrawSummaryQuality {
  sourceDrawCount: number;
  validDatedDrawCount: number;
  invalidDateCount: number;
  invalidNumberCount: number;
  duplicateNumberCount: number;
  syntheticMonthCount: number;
  warnings: string[];
}

export interface MonthlyDrawSummary {
  rows: MonthlyDrawMonthRow[];
  latestRow: MonthlyDrawMonthRow | null;
  latestBucketSets: MonthlyBucketSets;
  latestBucketLabels: Record<number, string>;
  effectiveBucketSets: MonthlyBucketSets;
  effectiveBucketLabels: Record<number, string>;
  effectiveMonthLabel: string;
  effectiveMonthDrawCount: number;
  effectiveMonthIsSynthetic: boolean;
  eligibleRows: MonthlyDrawMonthRow[];
  excludedMonthCount: number;
  drawCountOptions: number[];
  maxObservedDrawsPerMonth: number;
  bucketAverages: AvgBucketEntry[];
  bucketTargets: MonthlyBucketTarget[];
  currentDistribution: number[];
  targetDistribution: number[];
  neededDelta: MonthlyFrequencyCount[];
  idealDraw: IdealMonthlyDraw | null;
  quality: MonthlyDrawSummaryQuality;
}

export interface MonthlyIdealDrawState {
  bucketSets: MonthlyBucketSets;
  targetDistribution: number[];
  idealDrawBucketCounts: number[];
  effectiveMonthLabel: string;
  effectiveMonthIsSynthetic: boolean;
}

export type ExpectedDrawCountSource = "auto" | "override";

export interface StageIdealDrawState {
  bucketSets: MonthlyBucketSets;
  currentDistribution: number[];
  targetDistribution: number[];
  idealDrawBucketCounts: number[];
  workingMonthLabel: string;
  expectedDrawCount: number;
  targetStageDrawCount: number;
  completedDrawCount: number;
  comparableMonthCount: number;
  expectedDrawCountSource: ExpectedDrawCountSource;
  warnings: string[];
}

export interface StageMatchAcceptancePlaybookRow {
  targetUndrawnCount: number;
  historicalMonthLabel: string;
  historicalDistribution: number[];
  acceptanceNeedsBucketCounts: number[];
  projectedDistribution: number[];
  scoreBefore: number;
  scoreAfter: number;
  exactBucketHits: number;
  exact: boolean;
  supportCount: number;
  totalComparableCount: number;
  sameUndrawnMonthLabels: string[];
}

export interface StageMatchAcceptancePlaybook {
  bucketSets: MonthlyBucketSets;
  currentDistribution: number[];
  workingMonthLabel: string;
  expectedDrawCount: number;
  targetStageDrawCount: number;
  completedDrawCount: number;
  comparableMonthCount: number;
  expectedDrawCountSource: ExpectedDrawCountSource;
  rows: StageMatchAcceptancePlaybookRow[];
  warnings: string[];
}

export interface AnalyzeMonthlyDrawSummaryOptions {
  drawLimitPerMonth?: number | "all";
  averageDrawCountFilter?: number | "all";
  includeSupp?: boolean;
  today?: Date;
  drawSize?: number;
  maxNumber?: number;
  maxBucket?: number;
}

export interface AnalyzeStageIdealDrawArgs extends AnalyzeMonthlyDrawSummaryOptions {
  expectedDrawCountOverride?: number | "auto";
  forceWorkingMonthLabel?: string;
}

export interface ComputeIdealMonthlyDrawArgs {
  currentDistribution: number[];
  targetDistribution: number[];
  drawSize?: number;
}

interface ParsedDraw {
  monthLabel: string;
  timestamp: number;
  numbers: number[];
  invalidNumberCount: number;
  duplicateNumberCount: number;
}

const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_MAX_BUCKET = 8;
const DEFAULT_DRAW_SIZE = 8;
const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASH_DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/;

interface EffectiveMonthState {
  monthLabel: string;
  drawCount: number;
  isSynthetic: boolean;
  row: MonthlyDrawMonthRow | null;
}

export const createEmptyMonthlyBucketSets = (): MonthlyBucketSets => ({
  undrawn: new Set<number>(),
  times1: new Set<number>(),
  times2: new Set<number>(),
  times3: new Set<number>(),
  times4: new Set<number>(),
  times5: new Set<number>(),
  times6: new Set<number>(),
  times7: new Set<number>(),
  times8: new Set<number>(),
});

export const bucketKeyForTimes = (times: number): MonthlyBucketKey => {
  if (times <= 0) return "undrawn";
  if (times >= DEFAULT_MAX_BUCKET) return "times8";
  return `times${times}` as MonthlyBucketKey;
};

export const bucketLabelForTimes = (times: number): string => {
  if (times <= 0) return "Undrawn";
  return times >= DEFAULT_MAX_BUCKET ? "8x+" : `${times}x`;
};

export interface MonthlyBucketNumberDisplay {
  key: MonthlyBucketKey;
  times: number;
  label: string;
  color: string;
  softColor: string;
  textColor: string;
}

const MONTHLY_BUCKET_DISPLAY_COLORS: Record<number, { color: string; softColor: string }> = {
  0: { color: "#64748b", softColor: "#f1f5f9" },
  1: { color: "#2563eb", softColor: "#eff6ff" },
  2: { color: "#16a34a", softColor: "#f0fdf4" },
  3: { color: "#0891b2", softColor: "#ecfeff" },
  4: { color: "#ca8a04", softColor: "#fefce8" },
  5: { color: "#ea580c", softColor: "#fff7ed" },
  6: { color: "#dc2626", softColor: "#fef2f2" },
  7: { color: "#be123c", softColor: "#fff1f2" },
  8: { color: "#7c3aed", softColor: "#f5f3ff" },
};

const textColorForBackground = (hexColor: string): string => {
  const normalized = hexColor.replace("#", "");
  if (normalized.length !== 6) return "#fff";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.54 ? "#111827" : "#fff";
};

export const monthlyBucketDisplayForTimes = (times: number): MonthlyBucketNumberDisplay => {
  const clampedTimes = Math.min(Math.max(0, Math.floor(Number.isFinite(times) ? times : 0)), DEFAULT_MAX_BUCKET);
  const palette = MONTHLY_BUCKET_DISPLAY_COLORS[clampedTimes] ?? MONTHLY_BUCKET_DISPLAY_COLORS[DEFAULT_MAX_BUCKET];
  return {
    key: bucketKeyForTimes(clampedTimes),
    times: clampedTimes,
    label: bucketLabelForTimes(clampedTimes),
    color: palette.color,
    softColor: palette.softColor,
    textColor: textColorForBackground(palette.color),
  };
};

export const monthlyBucketTimesForNumber = (
  buckets: MonthlyBucketSets | null | undefined,
  number: number,
): number | null => {
  if (!buckets) return null;
  for (let index = 0; index < MONTHLY_BUCKET_KEYS.length; index += 1) {
    if (buckets[MONTHLY_BUCKET_KEYS[index]].has(number)) return index;
  }
  return null;
};

export const monthlyBucketDisplayForNumber = (
  buckets: MonthlyBucketSets | null | undefined,
  number: number,
): MonthlyBucketNumberDisplay | null => {
  const times = monthlyBucketTimesForNumber(buckets, number);
  return times === null ? null : monthlyBucketDisplayForTimes(times);
};

export const monthlyFrequencyConstraintsFromSelections = (
  selectedByBucket: MonthlyBucketSelections,
): MonthlyFrequencyConstraints => ({
  undrawn: selectedByBucket.undrawn.length,
  times1: selectedByBucket.times1.length,
  times2: selectedByBucket.times2.length,
  times3: selectedByBucket.times3.length,
  times4: selectedByBucket.times4.length,
  times5: selectedByBucket.times5.length,
  times6: selectedByBucket.times6.length,
  times7: selectedByBucket.times7.length,
  times8: selectedByBucket.times8.length,
});

export const projectMonthlyBucketCounts = (
  bucketSets: MonthlyBucketSets,
  selectedByBucket: MonthlyBucketSelections,
): MonthlyBucketProjectionMap => {
  const projection = {} as MonthlyBucketProjectionMap;

  for (const key of MONTHLY_BUCKET_KEYS) {
    const baseCount = bucketSets[key].size;
    projection[key] = {
      baseCount,
      projectedCount: baseCount,
      delta: 0,
      selectedCount: 0,
    };
  }

  for (let index = 0; index < MONTHLY_BUCKET_KEYS.length; index++) {
    const key = MONTHLY_BUCKET_KEYS[index];
    const selectedCount = new Set(
      selectedByBucket[key].filter((value) => Number.isInteger(value) && bucketSets[key].has(value)),
    ).size;
    projection[key].selectedCount = selectedCount;
    if (selectedCount === 0) continue;
    if (key === "times8") continue;

    projection[key].projectedCount -= selectedCount;
    const nextKey = MONTHLY_BUCKET_KEYS[index + 1] ?? key;
    projection[nextKey].projectedCount += selectedCount;
  }

  for (const key of MONTHLY_BUCKET_KEYS) {
    projection[key].delta = projection[key].projectedCount - projection[key].baseCount;
  }

  return projection;
};

export const numbersFromMonthlySelections = (
  selectedByBucket: MonthlyBucketSelections,
): number[] => {
  const selected = new Set<number>();
  for (const key of MONTHLY_BUCKET_KEYS) {
    for (const value of selectedByBucket[key]) {
      if (Number.isInteger(value) && value >= 1 && value <= DEFAULT_MAX_NUMBER) {
        selected.add(value);
      }
    }
  }
  return [...selected].sort((a, b) => a - b);
};

export const pruneMonthlySelections = (
  selectedByBucket: MonthlyBucketSelections,
  bucketSets: MonthlyBucketSets,
): MonthlyBucketSelections => {
  const next = {} as MonthlyBucketSelections;
  for (const key of MONTHLY_BUCKET_KEYS) {
    next[key] = selectedByBucket[key]
      .filter((value, index, arr) => arr.indexOf(value) === index && bucketSets[key].has(value))
      .sort((a, b) => a - b);
  }
  return next;
};

export const sampleMonthlyNumbers = (
  numbers: readonly number[],
  drawSize = DEFAULT_DRAW_SIZE,
  randomInt: (exclusiveMax: number) => number = secureRandomInt,
): number[] => {
  const pool = [...new Set(numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= DEFAULT_MAX_NUMBER))]
    .sort((a, b) => a - b);
  const limit = Math.min(Math.max(0, Math.floor(drawSize)), pool.length);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit).sort((a, b) => a - b);
};

export function analyzeMonthlyDrawSummary(
  history: Draw[],
  options: AnalyzeMonthlyDrawSummaryOptions = {},
): MonthlyDrawSummary {
  const maxNumber = normalizePositiveInteger(options.maxNumber, DEFAULT_MAX_NUMBER);
  const maxBucket = normalizePositiveInteger(options.maxBucket, DEFAULT_MAX_BUCKET);
  const drawSize = normalizePositiveInteger(options.drawSize, DEFAULT_DRAW_SIZE);
  const includeSupp = options.includeSupp ?? true;
  const parsed: ParsedDraw[] = [];
  const warnings: string[] = [];
  let invalidDateCount = 0;
  let invalidNumberCount = 0;
  let duplicateNumberCount = 0;

  for (const draw of history) {
    const dateInfo = parseDrawDate(draw.date);
    if (!dateInfo) {
      invalidDateCount++;
      continue;
    }
    const sanitized = sanitizeDrawNumbers(draw, { includeSupp, maxNumber });
    invalidNumberCount += sanitized.invalidNumberCount;
    duplicateNumberCount += sanitized.duplicateNumberCount;
    parsed.push({
      monthLabel: dateInfo.monthLabel,
      timestamp: dateInfo.timestamp,
      numbers: sanitized.numbers,
      invalidNumberCount: sanitized.invalidNumberCount,
      duplicateNumberCount: sanitized.duplicateNumberCount,
    });
  }

  parsed.sort((a, b) => a.timestamp - b.timestamp);

  const grouped = groupParsedDrawsByMonth(parsed);
  const maxObservedDrawsPerMonth = Math.max(1, ...[...grouped.values()].map((items) => items.length));
  const drawLimit = normalizeDrawLimit(options.drawLimitPerMonth, maxObservedDrawsPerMonth);
  const observedRows = buildRowsFromParsedDraws({ parsed, drawLimit, maxNumber, maxBucket, drawSize });

  const todayMonthLabel = monthLabelFromLocalDate(options.today ?? new Date());
  const effectiveMonth = resolveEffectiveMonthState({
    rows: observedRows,
    todayMonthLabel,
    maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    expectedDrawCountForMonth: (monthLabel) => expectedDrawCountFromRhythmOrFallback({
      parsed,
      monthLabel,
      fallback: maxObservedDrawsPerMonth,
    }),
  });
  const rows = rowsWithSyntheticPlanningMonth(observedRows, effectiveMonth);
  const latestRow = observedRows.length ? observedRows[observedRows.length - 1] : null;
  const latestBucketSets = latestRow
    ? bucketSetsFromDistribution(latestRow.numbers, latestRow.undrawn, maxBucket)
    : createEmptyMonthlyBucketSets();
  const latestBucketLabels = bucketLabelsFromSets(latestBucketSets, maxNumber);
  const effectiveBucketSets = effectiveMonth.row
    ? bucketSetsFromDistribution(effectiveMonth.row.numbers, effectiveMonth.row.undrawn, maxBucket)
    : createEmptyMonthlyBucketSets();
  const effectiveBucketLabels = bucketLabelsFromSets(effectiveBucketSets, maxNumber);
  const drawCountOptions = [...new Set(observedRows.map((row) => row.totalDrawCount))].sort((a, b) => a - b);

  const averageDrawCountFilter = options.averageDrawCountFilter ?? "all";
  const pastRows = observedRows.filter((row) => row.monthLabel !== effectiveMonth.monthLabel);
  const baselineRows = filterRowsForHistoryBaselines(pastRows, (row) => row.monthLabel);
  const eligibleRows = baselineRows.filter((row) => (
    averageDrawCountFilter === "all" || row.totalDrawCount === averageDrawCountFilter
  ));
  const excludedMonthCount = pastRows.length - eligibleRows.length;
  const currentDistribution = effectiveMonth.row?.distribution ?? new Array(maxBucket + 1).fill(0);
  const statsByBucket = buildBucketStats(eligibleRows, currentDistribution, maxBucket, maxNumber);
  const targetDistribution = statsByBucket.map((bucket) => bucket.targetCount);
  const neededDelta = targetDistribution.map((targetCount, times) => ({
    times,
    count: targetCount - (currentDistribution[times] ?? 0),
  }));
  const idealDraw = effectiveMonth.row && eligibleRows.length
    ? computeIdealMonthlyDraw({ currentDistribution, targetDistribution, drawSize })
    : null;

  if (invalidDateCount > 0) {
    warnings.push(`${invalidDateCount} draw ${invalidDateCount === 1 ? "row" : "rows"} ignored because ${invalidDateCount === 1 ? "its date could" : "their dates could"} not be parsed.`);
  }
  if (invalidNumberCount > 0) {
    warnings.push(`${invalidNumberCount} invalid number ${invalidNumberCount === 1 ? "entry" : "entries"} ignored.`);
  }
  if (duplicateNumberCount > 0) {
    warnings.push(`${duplicateNumberCount} duplicate ${duplicateNumberCount === 1 ? "entry" : "entries"} within a draw ignored before monthly counts were calculated.`);
  }

  return {
    rows,
    latestRow,
    latestBucketSets,
    latestBucketLabels,
    effectiveBucketSets,
    effectiveBucketLabels,
    effectiveMonthLabel: effectiveMonth.monthLabel,
    effectiveMonthDrawCount: effectiveMonth.drawCount,
    effectiveMonthIsSynthetic: effectiveMonth.isSynthetic,
    eligibleRows,
    excludedMonthCount,
    drawCountOptions,
    maxObservedDrawsPerMonth,
    bucketAverages: statsByBucket.map(({ times, avg }) => ({ times, avg })),
    bucketTargets: statsByBucket.map((bucket, index) => ({
      ...bucket,
      currentCount: currentDistribution[index] ?? 0,
      neededDelta: bucket.targetCount - (currentDistribution[index] ?? 0),
    })),
    currentDistribution,
    targetDistribution,
    neededDelta,
    idealDraw,
    quality: {
      sourceDrawCount: history.length,
      validDatedDrawCount: parsed.length,
      invalidDateCount,
      invalidNumberCount,
      duplicateNumberCount,
      syntheticMonthCount: effectiveMonth.isSynthetic ? 1 : 0,
      warnings,
    },
  };
}

export function analyzeStageIdealDrawModel(
  history: Draw[],
  args: AnalyzeStageIdealDrawArgs = {},
): StageIdealDrawState | null {
  const includeSupp = args.includeSupp ?? true;
  const maxNumber = normalizePositiveInteger(args.maxNumber, DEFAULT_MAX_NUMBER);
  const maxBucket = normalizePositiveInteger(args.maxBucket, DEFAULT_MAX_BUCKET);
  const drawSize = normalizePositiveInteger(args.drawSize, DEFAULT_DRAW_SIZE);
  const parsed = parseHistoryForMonthlyAnalysis(history, { includeSupp, maxNumber });
  if (!parsed.length) return null;

  const grouped = groupParsedDrawsByMonth(parsed);
  const maxObservedDrawsPerMonth = Math.max(1, ...[...grouped.values()].map((items) => items.length));
  const fullRows = buildRowsFromParsedDraws({
    parsed,
    drawLimit: maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    drawSize,
  });

  const todayMonthLabel = monthLabelFromLocalDate(args.today ?? new Date());
  const resolvedWorkingMonth = resolveEffectiveMonthState({
    rows: fullRows,
    todayMonthLabel,
    maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    expectedDrawCountForMonth: (monthLabel) => expectedDrawCountFromRhythmOrFallback({
      parsed,
      monthLabel,
      fallback: maxObservedDrawsPerMonth,
    }),
  }).monthLabel;
  const workingMonthLabel = args.forceWorkingMonthLabel || resolvedWorkingMonth;
  if (!workingMonthLabel) return null;

  const workingItems = grouped.get(workingMonthLabel) ?? [];
  const completedDrawCount = workingItems.length;
  const override = args.expectedDrawCountOverride;
  const inferredExpectedDrawCount = override && override !== "auto"
    ? Math.max(1, Math.floor(override))
    : expectedDrawCountFromRhythmOrFallback({
      parsed,
      monthLabel: workingMonthLabel,
      fallback: maxObservedDrawsPerMonth,
    });
  const expectedDrawCount = Math.max(1, inferredExpectedDrawCount);
  const expectedDrawCountSource: ExpectedDrawCountSource = override && override !== "auto" ? "override" : "auto";
  const unclampedTargetStage = completedDrawCount + 1;
  const targetStageDrawCount = Math.min(unclampedTargetStage, expectedDrawCount);
  const warnings: string[] = [];

  if (targetStageDrawCount !== unclampedTargetStage) {
    warnings.push(`Target stage was clamped to the expected ${expectedDrawCount} draws.`);
  }

  const pastRows = fullRows.filter((row) => row.monthLabel < workingMonthLabel);
  const baselineRows = filterRowsForHistoryBaselines(pastRows, (row) => row.monthLabel);
  const comparableItems = baselineRows
    .filter((row) => row.totalDrawCount === expectedDrawCount)
    .map((row) => grouped.get(row.monthLabel) ?? [])
    .filter((items) => items.length >= targetStageDrawCount);

  if (!comparableItems.length) return null;

  const partialRows = comparableItems.map((items) => buildMonthRow({
    monthLabel: items[0]?.monthLabel ?? "",
    draws: items.slice(0, targetStageDrawCount),
    totalDrawCount: items.length,
    maxNumber,
    maxBucket,
    drawSize,
  }));
  const currentRow = buildMonthRow({
    monthLabel: workingMonthLabel,
    draws: workingItems,
    totalDrawCount: expectedDrawCount,
    maxNumber,
    maxBucket,
    drawSize,
  });
  const targetDistribution = buildBucketStats(
    partialRows,
    currentRow.distribution,
    maxBucket,
    maxNumber,
  ).map((bucket) => bucket.targetCount);
  const idealDraw = computeIdealMonthlyDraw({
    currentDistribution: currentRow.distribution,
    targetDistribution,
    drawSize,
  });

  if (partialRows.length < 3) {
    warnings.push("Thin evidence: fewer than 3 comparable months.");
  }

  return {
    bucketSets: bucketSetsFromDistribution(currentRow.numbers, currentRow.undrawn, maxBucket),
    currentDistribution: currentRow.distribution,
    targetDistribution,
    idealDrawBucketCounts: idealDraw.bucketCounts.map(({ count }) => count),
    workingMonthLabel,
    expectedDrawCount,
    targetStageDrawCount,
    completedDrawCount,
    comparableMonthCount: partialRows.length,
    expectedDrawCountSource,
    warnings,
  };
}

export function analyzeStageMatchAcceptancePlaybook(
  history: Draw[],
  args: AnalyzeStageIdealDrawArgs = {},
): StageMatchAcceptancePlaybook | null {
  const includeSupp = args.includeSupp ?? true;
  const maxNumber = normalizePositiveInteger(args.maxNumber, DEFAULT_MAX_NUMBER);
  const maxBucket = normalizePositiveInteger(args.maxBucket, DEFAULT_MAX_BUCKET);
  const drawSize = normalizePositiveInteger(args.drawSize, DEFAULT_DRAW_SIZE);
  const parsed = parseHistoryForMonthlyAnalysis(history, { includeSupp, maxNumber });
  if (!parsed.length) return null;

  const grouped = groupParsedDrawsByMonth(parsed);
  const maxObservedDrawsPerMonth = Math.max(1, ...[...grouped.values()].map((items) => items.length));
  const fullRows = buildRowsFromParsedDraws({
    parsed,
    drawLimit: maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    drawSize,
  });

  const todayMonthLabel = monthLabelFromLocalDate(args.today ?? new Date());
  const resolvedWorkingMonth = resolveEffectiveMonthState({
    rows: fullRows,
    todayMonthLabel,
    maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    expectedDrawCountForMonth: (monthLabel) => expectedDrawCountFromRhythmOrFallback({
      parsed,
      monthLabel,
      fallback: maxObservedDrawsPerMonth,
    }),
  }).monthLabel;
  const workingMonthLabel = args.forceWorkingMonthLabel || resolvedWorkingMonth;
  if (!workingMonthLabel) return null;

  const workingItems = grouped.get(workingMonthLabel) ?? [];
  const completedDrawCount = workingItems.length;
  const override = args.expectedDrawCountOverride;
  const inferredExpectedDrawCount = override && override !== "auto"
    ? Math.max(1, Math.floor(override))
    : expectedDrawCountFromRhythmOrFallback({
      parsed,
      monthLabel: workingMonthLabel,
      fallback: maxObservedDrawsPerMonth,
    });
  const expectedDrawCount = Math.max(1, inferredExpectedDrawCount);
  const expectedDrawCountSource: ExpectedDrawCountSource = override && override !== "auto" ? "override" : "auto";
  const unclampedTargetStage = completedDrawCount + 1;
  const targetStageDrawCount = Math.min(unclampedTargetStage, expectedDrawCount);
  const warnings: string[] = [];

  if (targetStageDrawCount !== unclampedTargetStage) {
    warnings.push(`Target stage was clamped to the expected ${expectedDrawCount} draws.`);
  }

  const currentRow = buildMonthRow({
    monthLabel: workingMonthLabel,
    draws: workingItems,
    totalDrawCount: expectedDrawCount,
    maxNumber,
    maxBucket,
    drawSize,
  });

  const pastRows = fullRows.filter((row) => row.monthLabel < workingMonthLabel);
  const baselineRows = filterRowsForHistoryBaselines(pastRows, (row) => row.monthLabel);
  const comparableItems = baselineRows
    .filter((row) => row.totalDrawCount === expectedDrawCount)
    .map((row) => ({
      monthLabel: row.monthLabel,
      items: grouped.get(row.monthLabel) ?? [],
    }))
    .filter(({ items }) => items.length >= targetStageDrawCount);

  if (!comparableItems.length) return null;
  if (comparableItems.length < 3) {
    warnings.push("Thin evidence: fewer than 3 comparable months.");
  }

  const candidates = comparableItems.map(({ monthLabel, items }) => {
    const historicalStageRow = buildMonthRow({
      monthLabel,
      draws: items.slice(0, targetStageDrawCount),
      totalDrawCount: items.length,
      maxNumber,
      maxBucket,
      drawSize,
    });
    const idealDraw = computeIdealMonthlyDraw({
      currentDistribution: currentRow.distribution,
      targetDistribution: historicalStageRow.distribution,
      drawSize,
    });
    return {
      targetUndrawnCount: historicalStageRow.distribution[0] ?? 0,
      historicalMonthLabel: monthLabel,
      historicalDistribution: historicalStageRow.distribution,
      acceptanceNeedsBucketCounts: idealDraw.bucketCounts.map(({ count }) => count),
      projectedDistribution: idealDraw.projectedDistribution,
      scoreBefore: idealDraw.scoreBefore,
      scoreAfter: idealDraw.scoreAfter,
      exactBucketHits: idealDraw.exactBucketHits,
      exact: idealDraw.scoreAfter === 0,
    };
  });

  const supportByUndrawn = new Map<number, string[]>();
  for (const candidate of candidates) {
    const labels = supportByUndrawn.get(candidate.targetUndrawnCount) ?? [];
    labels.push(candidate.historicalMonthLabel);
    supportByUndrawn.set(candidate.targetUndrawnCount, labels);
  }

  const bestByUndrawn = new Map<number, typeof candidates[number]>();
  for (const candidate of candidates) {
    const previous = bestByUndrawn.get(candidate.targetUndrawnCount);
    if (
      !previous ||
      candidate.scoreAfter < previous.scoreAfter ||
      (candidate.scoreAfter === previous.scoreAfter && candidate.exactBucketHits > previous.exactBucketHits) ||
      (
        candidate.scoreAfter === previous.scoreAfter &&
        candidate.exactBucketHits === previous.exactBucketHits &&
        candidate.historicalMonthLabel.localeCompare(previous.historicalMonthLabel) > 0
      )
    ) {
      bestByUndrawn.set(candidate.targetUndrawnCount, candidate);
    }
  }

  const rows: StageMatchAcceptancePlaybookRow[] = [...bestByUndrawn.values()]
    .map((candidate) => {
      const labels = supportByUndrawn.get(candidate.targetUndrawnCount) ?? [];
      return {
        ...candidate,
        supportCount: labels.length,
        totalComparableCount: comparableItems.length,
        sameUndrawnMonthLabels: [...labels].sort((left, right) => right.localeCompare(left)),
      };
    })
    .sort((left, right) => (
      left.targetUndrawnCount - right.targetUndrawnCount ||
      left.scoreAfter - right.scoreAfter ||
      right.historicalMonthLabel.localeCompare(left.historicalMonthLabel)
    ));

  if (rows.some((row) => !row.exact)) {
    warnings.push("Nearest rows appear where the historical stage cannot be matched exactly in one draw from the current bucket state.");
  }

  return {
    bucketSets: bucketSetsFromDistribution(currentRow.numbers, currentRow.undrawn, maxBucket),
    currentDistribution: currentRow.distribution,
    workingMonthLabel,
    expectedDrawCount,
    targetStageDrawCount,
    completedDrawCount,
    comparableMonthCount: comparableItems.length,
    expectedDrawCountSource,
    rows,
    warnings,
  };
}

export function computeIdealMonthlyDraw(args: ComputeIdealMonthlyDrawArgs): IdealMonthlyDraw {
  const drawSize = normalizePositiveInteger(args.drawSize, DEFAULT_DRAW_SIZE);
  const maxBucket = Math.max(args.currentDistribution.length, args.targetDistribution.length, DEFAULT_MAX_BUCKET + 1) - 1;
  const current = normalizeDistribution(args.currentDistribution, maxBucket);
  const target = normalizeDistribution(args.targetDistribution, maxBucket);
  const allocation = new Array(maxBucket + 1).fill(0);
  let bestAllocation = [...allocation];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestExactHits = -1;
  let bestNeutralPicks = -1;

  const evaluate = () => {
    const simulated = applyMonthlyDrawAllocation(current, allocation);
    const score = sumSquaredDistance(simulated, target);
    const exactHits = simulated.reduce((hits, value, index) => hits + (value === target[index] ? 1 : 0), 0);
    const neutralPicks = allocation[maxBucket] ?? 0;
    if (
      score < bestScore ||
      (score === bestScore && exactHits > bestExactHits) ||
      (score === bestScore && exactHits === bestExactHits && neutralPicks > bestNeutralPicks)
    ) {
      bestScore = score;
      bestExactHits = exactHits;
      bestNeutralPicks = neutralPicks;
      bestAllocation = [...allocation];
    }
  };

  const search = (bucket: number, remaining: number) => {
    if (bucket === maxBucket) {
      if (remaining <= current[bucket]) {
        allocation[bucket] = remaining;
        evaluate();
        allocation[bucket] = 0;
      }
      return;
    }

    const maxDraws = Math.min(remaining, current[bucket]);
    for (let count = 0; count <= maxDraws; count++) {
      allocation[bucket] = count;
      search(bucket + 1, remaining - count);
    }
    allocation[bucket] = 0;
  };

  search(0, Math.min(drawSize, current.reduce((sum, value) => sum + value, 0)));

  return {
    bucketCounts: bestAllocation.map((count, times) => ({ times, count })),
    projectedDistribution: applyMonthlyDrawAllocation(current, bestAllocation),
    freePicks: bestAllocation[maxBucket] ?? 0,
    scoreBefore: sumSquaredDistance(current, target),
    scoreAfter: bestScore,
    exactBucketHits: bestExactHits,
  };
}

function parseDrawDate(rawDate: string | undefined): { monthLabel: string; timestamp: number } | null {
  if (!rawDate) return null;
  const isoMatch = rawDate.match(ISO_DATE_RE);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return {
        monthLabel: `${year}-${String(month).padStart(2, "0")}`,
        timestamp: date.getTime(),
      };
    }
    return null;
  }

  const slashMatch = rawDate.match(SLASH_DATE_RE);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return {
        monthLabel: `${year}-${String(month).padStart(2, "0")}`,
        timestamp: date.getTime(),
      };
    }
    return null;
  }

  const timestamp = Date.parse(rawDate);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return {
    monthLabel: monthLabelFromLocalDate(date),
    timestamp,
  };
}

function monthLabelFromLocalDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthLabel(monthLabel: string): string {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseHistoryForMonthlyAnalysis(
  history: Draw[],
  options: { includeSupp: boolean; maxNumber: number },
): ParsedDraw[] {
  const parsed: ParsedDraw[] = [];
  for (const draw of history) {
    const dateInfo = parseDrawDate(draw.date);
    if (!dateInfo) continue;
    const sanitized = sanitizeDrawNumbers(draw, options);
    parsed.push({
      monthLabel: dateInfo.monthLabel,
      timestamp: dateInfo.timestamp,
      numbers: sanitized.numbers,
      invalidNumberCount: sanitized.invalidNumberCount,
      duplicateNumberCount: sanitized.duplicateNumberCount,
    });
  }
  parsed.sort((a, b) => a.timestamp - b.timestamp);
  return parsed;
}

function groupParsedDrawsByMonth(parsed: ParsedDraw[]): Map<string, ParsedDraw[]> {
  const grouped = new Map<string, ParsedDraw[]>();
  for (const item of parsed) {
    const bucket = grouped.get(item.monthLabel);
    if (bucket) bucket.push(item);
    else grouped.set(item.monthLabel, [item]);
  }
  return grouped;
}

function buildRowsFromParsedDraws(args: {
  parsed: ParsedDraw[];
  drawLimit: number;
  maxNumber: number;
  maxBucket: number;
  drawSize: number;
}): MonthlyDrawMonthRow[] {
  return [...groupParsedDrawsByMonth(args.parsed).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthLabel, items]) => buildMonthRow({
      monthLabel,
      draws: items.slice(0, args.drawLimit),
      totalDrawCount: items.length,
      maxNumber: args.maxNumber,
      maxBucket: args.maxBucket,
      drawSize: args.drawSize,
    }));
}

function inferExpectedDrawCountFromWeekdayRhythm(args: {
  parsed: ParsedDraw[];
  workingMonthLabel: string;
}): number | null {
  const monthLabels = [...new Set(args.parsed.map((draw) => draw.monthLabel))].sort();
  const sourceMonthLabel = [...monthLabels]
    .reverse()
    .find((monthLabel) => monthLabel <= args.workingMonthLabel) ?? monthLabels[monthLabels.length - 1] ?? "";
  const sourceMonthDraws = sourceMonthLabel
    ? args.parsed.filter((draw) => draw.monthLabel === sourceMonthLabel)
    : [];
  const recent = sourceMonthDraws.length ? sourceMonthDraws : args.parsed.slice(-30);
  const weekdays = new Set<number>();
  for (const draw of recent) {
    const date = new Date(draw.timestamp);
    if (!Number.isNaN(date.getTime())) weekdays.add(date.getDay());
  }
  if (!weekdays.size || !args.workingMonthLabel) return null;

  const [yearRaw, monthRaw] = args.workingMonthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (weekdays.has(date.getDay())) count++;
  }
  return count > 0 ? count : null;
}

function expectedDrawCountFromRhythmOrFallback(args: {
  parsed: ParsedDraw[];
  monthLabel: string;
  fallback: number;
}): number {
  const fallback = Math.max(1, Math.floor(args.fallback));
  const inferred = inferExpectedDrawCountFromWeekdayRhythm({
    parsed: args.parsed,
    workingMonthLabel: args.monthLabel,
  });
  if (!inferred) return fallback;

  const plausibleUpperBound = Math.max(fallback + 1, Math.ceil(fallback * 1.25));
  if (inferred > plausibleUpperBound) return fallback;
  return Math.max(1, Math.floor(inferred));
}

function buildSyntheticMonthRow(args: {
  monthLabel: string;
  totalDrawCount?: number;
  maxNumber: number;
  maxBucket: number;
}): MonthlyDrawMonthRow {
  const distribution = new Array(args.maxBucket + 1).fill(0);
  distribution[0] = args.maxNumber;
  return {
    monthLabel: args.monthLabel,
    drawCount: 0,
    totalDrawCount: Math.max(0, Math.floor(args.totalDrawCount ?? 0)),
    numbers: [],
    frequencyCounts: [],
    undrawn: Array.from({ length: args.maxNumber }, (_, index) => index + 1),
    distribution,
    validNumberOccurrences: 0,
    expectedNumberSlots: 0,
    ignoredNumberEntries: 0,
  };
}

function resolveEffectiveMonthState(args: {
  rows: MonthlyDrawMonthRow[];
  todayMonthLabel: string;
  maxObservedDrawsPerMonth: number;
  maxNumber: number;
  maxBucket: number;
  expectedDrawCountForMonth?: (monthLabel: string) => number;
}): EffectiveMonthState {
  const { rows, todayMonthLabel, maxObservedDrawsPerMonth, maxNumber, maxBucket } = args;
  const expectedDrawCountForMonth = (monthLabel: string) => {
    const expected = args.expectedDrawCountForMonth?.(monthLabel) ?? maxObservedDrawsPerMonth;
    return Math.max(1, Math.floor(expected));
  };
  const latestRow = rows.length ? rows[rows.length - 1] : null;
  const latestMonthLabel = latestRow?.monthLabel ?? "";
  const rowByMonth = new Map(rows.map((row) => [row.monthLabel, row]));

  if (!latestRow) {
    if (!todayMonthLabel) {
      return { monthLabel: "", drawCount: 0, isSynthetic: false, row: null };
    }
    const syntheticRow = buildSyntheticMonthRow({
      monthLabel: todayMonthLabel,
      totalDrawCount: expectedDrawCountForMonth(todayMonthLabel),
      maxNumber,
      maxBucket,
    });
    return { monthLabel: todayMonthLabel, drawCount: 0, isSynthetic: true, row: syntheticRow };
  }

  let effectiveMonthLabel = latestMonthLabel;
  if (todayMonthLabel) {
    if (todayMonthLabel > latestMonthLabel) {
      effectiveMonthLabel = todayMonthLabel;
    } else if (todayMonthLabel === latestMonthLabel) {
      const expectedLatestDrawCount = expectedDrawCountForMonth(latestMonthLabel);
      const shouldAdvanceToNextMonth = rows.length > 1 && latestRow.totalDrawCount >= expectedLatestDrawCount;
      effectiveMonthLabel = shouldAdvanceToNextMonth ? nextMonthLabel(todayMonthLabel) : todayMonthLabel;
    }
  }

  const observedRow = rowByMonth.get(effectiveMonthLabel) ?? null;
  if (observedRow) {
    return {
      monthLabel: effectiveMonthLabel,
      drawCount: observedRow.drawCount,
      isSynthetic: false,
      row: observedRow,
    };
  }

  const syntheticRow = buildSyntheticMonthRow({
    monthLabel: effectiveMonthLabel,
    totalDrawCount: expectedDrawCountForMonth(effectiveMonthLabel),
    maxNumber,
    maxBucket,
  });
  return {
    monthLabel: effectiveMonthLabel,
    drawCount: 0,
    isSynthetic: true,
    row: syntheticRow,
  };
}

function rowsWithSyntheticPlanningMonth(
  observedRows: MonthlyDrawMonthRow[],
  effectiveMonth: EffectiveMonthState,
): MonthlyDrawMonthRow[] {
  if (!observedRows.length || !effectiveMonth.isSynthetic || !effectiveMonth.row || !effectiveMonth.monthLabel) {
    return observedRows;
  }
  if (observedRows.some((row) => row.monthLabel === effectiveMonth.monthLabel)) {
    return observedRows;
  }
  return [...observedRows, effectiveMonth.row].sort((a, b) => a.monthLabel.localeCompare(b.monthLabel));
}

function sanitizeDrawNumbers(
  draw: Draw,
  options: { includeSupp: boolean; maxNumber: number },
): { numbers: number[]; invalidNumberCount: number; duplicateNumberCount: number } {
  const rawNumbers = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(options.includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];
  const seen = new Set<number>();
  let invalidNumberCount = 0;
  let duplicateNumberCount = 0;

  for (const value of rawNumbers) {
    if (!Number.isInteger(value) || value < 1 || value > options.maxNumber) {
      invalidNumberCount++;
      continue;
    }
    if (seen.has(value)) {
      duplicateNumberCount++;
      continue;
    }
    seen.add(value);
  }

  return {
    numbers: [...seen].sort((a, b) => a - b),
    invalidNumberCount,
    duplicateNumberCount,
  };
}

function buildMonthRow(args: {
  monthLabel: string;
  draws: ParsedDraw[];
  totalDrawCount: number;
  maxNumber: number;
  maxBucket: number;
  drawSize: number;
}): MonthlyDrawMonthRow {
  const counts = new Array(args.maxNumber).fill(0);
  let ignoredNumberEntries = 0;

  for (const draw of args.draws) {
    ignoredNumberEntries += draw.invalidNumberCount + draw.duplicateNumberCount;
    for (const n of draw.numbers) {
      counts[n - 1] += 1;
    }
  }

  const numbers: MonthlyNumberCount[] = [];
  const undrawn: number[] = [];
  const distribution = new Array(args.maxBucket + 1).fill(0);
  for (let index = 0; index < counts.length; index++) {
    const count = counts[index];
    const n = index + 1;
    if (count === 0) {
      undrawn.push(n);
      distribution[0] += 1;
    } else {
      numbers.push({ n, c: count });
      distribution[Math.min(count, args.maxBucket)] += 1;
    }
  }

  const frequencyCounts = distribution
    .map((count, times) => ({ times, count }))
    .filter(({ times, count }) => times > 0 && count > 0);

  return {
    monthLabel: args.monthLabel,
    drawCount: args.draws.length,
    totalDrawCount: args.totalDrawCount,
    numbers,
    frequencyCounts,
    undrawn,
    distribution,
    validNumberOccurrences: numbers.reduce((sum, entry) => sum + entry.c, 0),
    expectedNumberSlots: args.draws.length * args.drawSize,
    ignoredNumberEntries,
  };
}

function bucketSetsFromDistribution(
  numbers: MonthlyNumberCount[],
  undrawn: number[],
  maxBucket: number,
): MonthlyBucketSets {
  const sets = createEmptyMonthlyBucketSets();
  for (const n of undrawn) sets.undrawn.add(n);
  for (const { n, c } of numbers) {
    sets[bucketKeyForTimes(Math.min(c, maxBucket))].add(n);
  }
  return sets;
}

function bucketLabelsFromSets(bucketSets: MonthlyBucketSets, maxNumber: number): Record<number, string> {
  const labels: Record<number, string> = {};
  for (let n = 1; n <= maxNumber; n++) {
    for (let index = 0; index < MONTHLY_BUCKET_KEYS.length; index++) {
      const key = MONTHLY_BUCKET_KEYS[index];
      if (bucketSets[key].has(n)) {
        labels[n] = bucketLabelForTimes(index);
        break;
      }
    }
  }
  return labels;
}

function buildBucketStats(
  eligibleRows: MonthlyDrawMonthRow[],
  currentDistribution: number[],
  maxBucket: number,
  maxNumber: number,
): MonthlyBucketTarget[] {
  if (!eligibleRows.length) {
    return currentDistribution.map((currentCount, times) => ({
      times,
      avg: currentCount,
      median: currentCount,
      q1: currentCount,
      q3: currentCount,
      targetCount: currentCount,
      currentCount,
      neededDelta: 0,
    }));
  }

  const rawTargets: number[] = [];
  const stats = new Array(maxBucket + 1).fill(null).map((_, times) => {
    const values = eligibleRows.map((row) => row.distribution[times] ?? 0).sort((a, b) => a - b);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const median = quantile(values, 0.5);
    rawTargets[times] = median;
    return {
      times,
      avg,
      median,
      q1: quantile(values, 0.25),
      q3: quantile(values, 0.75),
      targetCount: 0,
      currentCount: currentDistribution[times] ?? 0,
      neededDelta: 0,
    };
  });

  const targetDistribution = reconcileDistribution(rawTargets, maxNumber);
  return stats.map((entry, index) => ({
    ...entry,
    targetCount: targetDistribution[index] ?? 0,
    neededDelta: (targetDistribution[index] ?? 0) - (currentDistribution[index] ?? 0),
  }));
}

function reconcileDistribution(rawValues: number[], total: number): number[] {
  const cleaned = rawValues.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const rawTotal = cleaned.reduce((sum, value) => sum + value, 0);
  if (rawTotal <= 0) {
    const fallback = new Array(rawValues.length).fill(0);
    fallback[0] = total;
    return fallback;
  }

  const scaled = cleaned.map((value) => (value / rawTotal) * total);
  const floors = scaled.map(Math.floor);
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const ranked = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of ranked) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder--;
  }

  return floors;
}

function quantile(sortedValues: number[], q: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function normalizeDrawLimit(input: number | "all" | undefined, fallback: number): number {
  if (input === "all" || input === undefined) return fallback;
  return Math.min(Math.max(1, Math.floor(input)), fallback);
}

function normalizePositiveInteger(input: number | undefined, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(1, Math.floor(input));
}

function normalizeDistribution(input: number[], maxBucket: number): number[] {
  return new Array(maxBucket + 1).fill(0).map((_, index) => {
    const value = input[index] ?? 0;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  });
}

function applyMonthlyDrawAllocation(current: number[], allocation: number[]): number[] {
  const simulated = [...current];
  const maxBucket = simulated.length - 1;
  for (let times = 0; times <= maxBucket; times++) {
    const count = allocation[times] ?? 0;
    if (count <= 0) continue;
    simulated[times] -= count;
    if (times < maxBucket) simulated[times + 1] += count;
    else simulated[times] += count;
  }
  return simulated;
}

function sumSquaredDistance(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    total += delta * delta;
  }
  return total;
}

function secureRandomInt(exclusiveMax: number): number {
  const max = Math.floor(exclusiveMax);
  if (max <= 1) return 0;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) return Math.floor(Math.random() * max);
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}
