import type { Draw } from "../types";
import { getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import { filterRealDrawHistory } from "./realDrawHistory";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

const TOTAL_NUMBERS = 45;
const DEFAULT_EARLY_DRAW_LIMIT = 3;
const DEFAULT_TOP_NUMBERS = 8;
const DEFAULT_WEIGHT_MIN = 0.75;
const DEFAULT_WEIGHT_MAX = 2;
const FULL_SUPPORT_TRANSITIONS = 4;
const GLOBAL_EARLY_HIT_PRIOR_INSTANCES = 20;
const NUMBER_EARLY_HIT_PRIOR_OPPORTUNITIES = 4;
export const SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR = 1000;

export interface MonthEndCarryOverNumberStat {
  number: number;
  monthEndsUndrawn: number;
  earlyNextMonthHits: number;
  earlyHitRate: number;
  adjustedEarlyHitRate: number;
  baselineHitRate: number;
  lift: number;
  adjustedLift: number;
  supportWeight: number;
}

export interface MonthEndCarryOverTimingStat {
  drawOffset: number;
  hitCount: number;
  hitRate: number;
}

export interface MonthEndCarryOverSummary {
  transitions: number;
  earlyDrawLimit: number;
  totalMonthEndUndrawnInstances: number;
  earlyHitCount: number;
  earlyHitRate: number;
  baselineHitRate: number;
  lift: number;
  monthEndUndrawnMean: number;
  earlyHitRange95: [number, number];
}

export interface MonthEndCarryOverAnalysis {
  summary: MonthEndCarryOverSummary;
  numberStats: MonthEndCarryOverNumberStat[];
  topEarlyHitNumbers: MonthEndCarryOverNumberStat[];
  topPersistentNumbers: MonthEndCarryOverNumberStat[];
  timing: MonthEndCarryOverTimingStat[];
  notes: string[];
}

export interface MonthEndCarryOverWeightingNumber extends MonthEndCarryOverNumberStat {
  factor: number;
  active: boolean;
}

export interface MonthEndCarryOverWeighting {
  defaultEnabled: boolean;
  targetMonthLabel: string;
  sourceMonthLabel: string | null;
  drawsSoFarThisMonth: number;
  earlyDrawLimit: number;
  activeNumbers: number[];
  monthEndUndrawnNumbers: number[];
  boundaryRepeatNumbers: number[];
  weights: Record<number, number>;
  weightedNumbers: MonthEndCarryOverWeightingNumber[];
  notes: string[];
}

interface MonthlySegment {
  monthLabel: string;
  drawnSets: Set<number>[];
  union: Set<number>;
  undrawn: Set<number>;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
);

const shrinkBinomialRate = (
  successes: number,
  trials: number,
  priorMean: number,
  priorStrength: number,
): number => {
  const cleanSuccesses = Math.max(0, Number.isFinite(successes) ? successes : 0);
  const cleanTrials = Math.max(0, Number.isFinite(trials) ? trials : 0);
  const cleanPriorMean = clamp(Number.isFinite(priorMean) ? priorMean : 0, 0, 1);
  const cleanPriorStrength = Math.max(0, Number.isFinite(priorStrength) ? priorStrength : 0);
  const denominator = cleanTrials + cleanPriorStrength;
  if (denominator <= 0) return cleanPriorMean;
  return clamp((cleanSuccesses + cleanPriorMean * cleanPriorStrength) / denominator, 0, 1);
};

const quantile = (values: number[], probability: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = clamp(probability, 0, 1);
  const index = clamped * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const quantileRange95 = (values: number[]): [number, number] => [
  quantile(values, 0.025),
  quantile(values, 0.975),
];

const toMonthLabel = (epoch: number): string => {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const nextMonthLabel = (monthLabel: string): string => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
};

const previousMonthLabel = (monthLabel: string): string => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
};

const emptyWeightMap = (): Record<number, number> => {
  const weights: Record<number, number> = {};
  for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
    weights[number] = 1;
  }
  return weights;
};

const sortedUniqueNumbers = (numbers: Iterable<number>): number[] => Array.from(new Set(numbers)).sort((left, right) => left - right);

export function buildEffectiveMonthEndCarryOverWeights(
  baseWeights: Record<number, number> | undefined,
  selectedNumbers: number[] = [],
  boostFactor: number = SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR,
): Record<number, number> | undefined {
  const cleanSelected = Array.from(
    new Set(
      selectedNumbers.filter((number) => Number.isInteger(number) && number >= 1 && number <= TOTAL_NUMBERS),
    ),
  );
  const hasBaseWeights = !!baseWeights && Object.values(baseWeights).some((factor) => Math.abs((Number(factor) || 1) - 1) > 1e-9);
  if (!hasBaseWeights && cleanSelected.length === 0) return undefined;

  const effectiveWeights = baseWeights ? { ...baseWeights } : emptyWeightMap();
  const safeBoostFactor = Math.max(1, Number.isFinite(boostFactor) ? boostFactor : SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR);
  for (const number of cleanSelected) {
    const baseFactor = Number(effectiveWeights[number]);
    effectiveWeights[number] = Math.max(1, Number.isFinite(baseFactor) ? baseFactor : 1) * safeBoostFactor;
  }
  return effectiveWeights;
}

const toSelectedSet = (draw: Draw, includeSupp: boolean): Set<number> => {
  const selected = new Set<number>();
  const values = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];
  for (const value of values) {
    if (Number.isInteger(value) && value >= 1 && value <= TOTAL_NUMBERS) {
      selected.add(value);
    }
  }
  return selected;
};

const buildMonthlySegments = (history: Draw[], includeSupp: boolean): MonthlySegment[] => {
  const chrono = sortDrawsChronologically(history);
  const segments: MonthlySegment[] = [];
  let active: MonthlySegment | null = null;

  for (const draw of chrono) {
    const epoch = parseDrawDateToEpoch(draw.date);
    if (!epoch) continue;
    const monthLabel = toMonthLabel(epoch);
    if (!active || active.monthLabel !== monthLabel) {
      active = {
        monthLabel,
        drawnSets: [],
        union: new Set<number>(),
        undrawn: new Set<number>(),
      };
      segments.push(active);
    }

    const selected = toSelectedSet(draw, includeSupp);
    active.drawnSets.push(selected);
    for (const number of selected) active.union.add(number);
  }

  for (const segment of segments) {
    const undrawn = new Set<number>();
    for (let number = 1; number <= TOTAL_NUMBERS; number += 1) {
      if (!segment.union.has(number)) undrawn.add(number);
    }
    segment.undrawn = undrawn;
  }

  return segments;
};

export function analyzeMonthEndCarryOver(
  history: Draw[],
  options: { includeSupp: boolean; earlyDrawLimit?: number; topNumbers?: number },
): MonthEndCarryOverAnalysis {
  const includeSupp = options.includeSupp;
  const earlyDrawLimit = Math.max(1, Math.floor(options.earlyDrawLimit ?? DEFAULT_EARLY_DRAW_LIMIT));
  const topNumbers = Math.max(1, Math.floor(options.topNumbers ?? DEFAULT_TOP_NUMBERS));
  const realHistory = filterRealDrawHistory(history, "month-end carry-over diagnostics");
  const segments = buildMonthlySegments(realHistory.history, includeSupp);
  const excludedMonthLabels = new Set(
    getExcludedMonthLabelsForHistoryBaselines(segments, (segment) => segment.monthLabel),
  );

  if (segments.length < 2) {
    return {
      summary: {
        transitions: 0,
        earlyDrawLimit,
        totalMonthEndUndrawnInstances: 0,
        earlyHitCount: 0,
        earlyHitRate: 0,
        baselineHitRate: 0,
        lift: 0,
        monthEndUndrawnMean: 0,
        earlyHitRange95: [0, 0],
      },
      numberStats: [],
      topEarlyHitNumbers: [],
      topPersistentNumbers: [],
      timing: Array.from({ length: earlyDrawLimit }, (_, index) => ({
        drawOffset: index + 1,
        hitCount: 0,
        hitRate: 0,
      })),
      notes: [
        ...realHistory.warnings,
        "Need at least two complete months in the active history window to analyse month-end carry-over.",
      ],
    };
  }

  const monthEndCounts: number[] = [];
  const earlyHitCountsByTransition: number[] = [];
  const timingCounts = new Array<number>(earlyDrawLimit).fill(0);
  const perNumberCounts = Array.from({ length: TOTAL_NUMBERS + 1 }, () => ({
    monthEndsUndrawn: 0,
    earlyHits: 0,
  }));
  let totalMonthEndUndrawnInstances = 0;
  let earlyHitCount = 0;
  let baselineHits = 0;
  let baselineTrials = 0;
  let skippedGapTransitions = 0;
  let skippedPartialSourceTransitions = 0;

  for (let monthIndex = 0; monthIndex < segments.length - 1; monthIndex += 1) {
    const current = segments[monthIndex];
    const next = segments[monthIndex + 1];
    if (excludedMonthLabels.has(current.monthLabel)) {
      skippedPartialSourceTransitions += 1;
      continue;
    }
    if (next.monthLabel !== nextMonthLabel(current.monthLabel)) {
      skippedGapTransitions += 1;
      continue;
    }
    const earlyDraws = next.drawnSets.slice(0, earlyDrawLimit);
    if (!earlyDraws.length) continue;

    const monthEndUndrawn = [...current.undrawn];
    monthEndCounts.push(monthEndUndrawn.length);
    totalMonthEndUndrawnInstances += monthEndUndrawn.length;

    const firstHitOffset = new Map<number, number>();
    earlyDraws.forEach((drawnSet, drawOffset) => {
      for (const number of drawnSet) {
        if (!firstHitOffset.has(number)) firstHitOffset.set(number, drawOffset + 1);
      }
    });

    let transitionHits = 0;
    for (const number of monthEndUndrawn) {
      perNumberCounts[number].monthEndsUndrawn += 1;
      const offset = firstHitOffset.get(number);
      if (offset) {
        transitionHits += 1;
        earlyHitCount += 1;
        perNumberCounts[number].earlyHits += 1;
        timingCounts[offset - 1] += 1;
      }
    }
    earlyHitCountsByTransition.push(transitionHits);

    const earlyWindowUnion = new Set<number>();
    for (const drawnSet of earlyDraws) {
      for (const number of drawnSet) earlyWindowUnion.add(number);
    }
    baselineTrials += TOTAL_NUMBERS;
    baselineHits += earlyWindowUnion.size;
  }

  const transitions = earlyHitCountsByTransition.length;
  const earlyHitRate = totalMonthEndUndrawnInstances > 0 ? earlyHitCount / totalMonthEndUndrawnInstances : 0;
  const baselineHitRate = baselineTrials > 0 ? baselineHits / baselineTrials : 0;
  const lift = baselineHitRate > 0 ? earlyHitRate / baselineHitRate : 0;
  const adjustedOverallEarlyHitRate = shrinkBinomialRate(
    earlyHitCount,
    totalMonthEndUndrawnInstances,
    baselineHitRate,
    GLOBAL_EARLY_HIT_PRIOR_INSTANCES,
  );

  const ranked = Array.from({ length: TOTAL_NUMBERS }, (_, index) => {
    const number = index + 1;
    const stat = perNumberCounts[number];
    const earlyHitRateForNumber = stat.monthEndsUndrawn > 0 ? stat.earlyHits / stat.monthEndsUndrawn : 0;
    const baselineForNumber = transitions > 0 ? baselineHitRate : 0;
    const adjustedEarlyHitRate = shrinkBinomialRate(
      stat.earlyHits,
      stat.monthEndsUndrawn,
      adjustedOverallEarlyHitRate,
      NUMBER_EARLY_HIT_PRIOR_OPPORTUNITIES,
    );
    const numberLift = baselineForNumber > 0 ? earlyHitRateForNumber / baselineForNumber : 0;
    const adjustedLift = baselineForNumber > 0 ? adjustedEarlyHitRate / baselineForNumber : 0;
    const supportWeight = stat.monthEndsUndrawn > 0
      ? stat.monthEndsUndrawn / (stat.monthEndsUndrawn + NUMBER_EARLY_HIT_PRIOR_OPPORTUNITIES)
      : 0;
    return {
      number,
      monthEndsUndrawn: stat.monthEndsUndrawn,
      earlyNextMonthHits: stat.earlyHits,
      earlyHitRate: earlyHitRateForNumber,
      adjustedEarlyHitRate,
      baselineHitRate: baselineForNumber,
      lift: numberLift,
      adjustedLift,
      supportWeight,
    };
  }).filter((item) => item.monthEndsUndrawn > 0);

  const numberStats = [...ranked].sort((left, right) => left.number - right.number);

  const topEarlyHitNumbers = [...ranked]
    .sort((left, right) => right.adjustedEarlyHitRate - left.adjustedEarlyHitRate || right.earlyHitRate - left.earlyHitRate || right.monthEndsUndrawn - left.monthEndsUndrawn || left.number - right.number)
    .slice(0, topNumbers);

  const topPersistentNumbers = [...ranked]
    .sort((left, right) => left.adjustedEarlyHitRate - right.adjustedEarlyHitRate || left.earlyHitRate - right.earlyHitRate || right.monthEndsUndrawn - left.monthEndsUndrawn || left.number - right.number)
    .slice(0, topNumbers);

  const timing = timingCounts.map((hitCount, index) => ({
    drawOffset: index + 1,
    hitCount,
    hitRate: totalMonthEndUndrawnInstances > 0 ? hitCount / totalMonthEndUndrawnInstances : 0,
  }));

  const notes = [
    ...realHistory.warnings,
    `This analysis tracks numbers that finished a month in the month-end undrawn set, then checks whether they were drawn in the first ${earlyDrawLimit} draw${earlyDrawLimit === 1 ? "" : "s"} of the next month.`,
    `Baseline hit rate is the ordinary chance that a number appeared at least once in those same early-next-month windows (${(baselineHitRate * 100).toFixed(1)}%). Lift above 1.00 means month-end undrawn numbers were drawn early more often than a random number would be.`,
    "Number rankings use beta-binomial shrinkage toward the early-window baseline, so isolated 1/1 or 0/1 records do not outrank better-supported evidence by default.",
    "If the active history window cuts through a month, the first and/or last visible month may be partial, so treat boundary months more cautiously than full-history analysis.",
  ];

  if (skippedGapTransitions > 0) {
    notes.push(`Skipped ${skippedGapTransitions} non-consecutive month transition${skippedGapTransitions === 1 ? "" : "s"} in the active window.`);
  }
  if (skippedPartialSourceTransitions > 0) {
    notes.push(`Excluded ${skippedPartialSourceTransitions} opening partial-month transition${skippedPartialSourceTransitions === 1 ? "" : "s"} from 2024-05 when computing history-wide carry-over averages.`);
  }

  return {
    summary: {
      transitions,
      earlyDrawLimit,
      totalMonthEndUndrawnInstances,
      earlyHitCount,
      earlyHitRate,
      baselineHitRate,
      lift,
      monthEndUndrawnMean: mean(monthEndCounts),
      earlyHitRange95: quantileRange95(earlyHitCountsByTransition),
    },
    numberStats,
    topEarlyHitNumbers,
    topPersistentNumbers,
    timing,
    notes,
  };
}

export function buildMonthEndCarryOverWeighting(
  history: Draw[],
  options: {
    includeSupp?: boolean;
    earlyDrawLimit?: number;
    referenceDate?: Date;
    factorMin?: number;
    factorMax?: number;
    factorScale?: number;
    includeMonthEndUndrawn?: boolean;
    includeBoundaryRepeats?: boolean;
  } = {},
): MonthEndCarryOverWeighting {
  const includeSupp = options.includeSupp ?? true;
  const earlyDrawLimit = Math.max(1, Math.floor(options.earlyDrawLimit ?? DEFAULT_EARLY_DRAW_LIMIT));
  const referenceDate = options.referenceDate ?? new Date();
  const referenceEpoch = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate.getTime()
    : Date.now();
  const factorMin = clamp(options.factorMin ?? DEFAULT_WEIGHT_MIN, 0.1, 1);
  const factorMax = Math.max(1, options.factorMax ?? DEFAULT_WEIGHT_MAX);
  const factorScale = Math.max(0, Number.isFinite(options.factorScale ?? 1) ? options.factorScale ?? 1 : 1);
  const includeMonthEndUndrawn = options.includeMonthEndUndrawn ?? true;
  const includeBoundaryRepeats = options.includeBoundaryRepeats ?? true;
  const targetMonthLabel = toMonthLabel(referenceEpoch);
  const sourceMonthLabel = previousMonthLabel(targetMonthLabel) || null;
  const realHistory = filterRealDrawHistory(history, "month-end carry-over weighting calculations");
  const segments = buildMonthlySegments(realHistory.history, includeSupp);
  const currentSegment = segments.find((segment) => segment.monthLabel === targetMonthLabel) ?? null;
  const sourceSegment = sourceMonthLabel
    ? segments.find((segment) => segment.monthLabel === sourceMonthLabel) ?? null
    : null;
  const drawsSoFarThisMonth = currentSegment?.drawnSets.length ?? 0;
  const weights = emptyWeightMap();
  const analysis = analyzeMonthEndCarryOver(realHistory.history, { includeSupp, earlyDrawLimit, topNumbers: TOTAL_NUMBERS });
  const statsByNumber = new Map(analysis.numberStats.map((item) => [item.number, item]));
  const currentMonthSeen = currentSegment?.union ?? new Set<number>();
  const monthEndUndrawnNumbers = sourceSegment
    ? Array.from(sourceSegment.undrawn)
        .filter((number) => !currentMonthSeen.has(number))
        .sort((left, right) => left - right)
    : [];
  const sourceLastDraw = sourceSegment?.drawnSets[sourceSegment.drawnSets.length - 1] ?? null;
  const currentFirstDraw = currentSegment?.drawnSets[0] ?? null;
  const boundaryRepeatNumbers = sourceLastDraw && currentFirstDraw
    ? sortedUniqueNumbers(Array.from(sourceLastDraw).filter((number) => currentFirstDraw.has(number)))
    : [];
  const activeMonthEndUndrawnNumbers = includeMonthEndUndrawn ? monthEndUndrawnNumbers : [];
  const activeBoundaryRepeatNumbers = includeBoundaryRepeats ? boundaryRepeatNumbers : [];
  const activeNumbers = sortedUniqueNumbers([...activeMonthEndUndrawnNumbers, ...activeBoundaryRepeatNumbers]);
  const overallFactor = clamp(analysis.summary.lift || 1, factorMin, factorMax);

  const weightedNumbers = activeNumbers
    .map<MonthEndCarryOverWeightingNumber>((number) => {
      const stat = statsByNumber.get(number);
      const smoothedRate = stat
        ? stat.adjustedEarlyHitRate
        : analysis.summary.baselineHitRate;
      const rawLift = analysis.summary.baselineHitRate > 0
        ? smoothedRate / analysis.summary.baselineHitRate
        : 1;
      const support = stat ? Math.max(stat.supportWeight, Math.min(1, stat.monthEndsUndrawn / FULL_SUPPORT_TRANSITIONS)) : 0;
      const unscaledFactor = clamp(overallFactor + (rawLift - overallFactor) * support, factorMin, factorMax);
      const factor = clamp(1 + (unscaledFactor - 1) * factorScale, factorMin, factorMax);
      weights[number] = factor;
      return {
        number,
        monthEndsUndrawn: stat?.monthEndsUndrawn ?? 0,
        earlyNextMonthHits: stat?.earlyNextMonthHits ?? 0,
        earlyHitRate: stat?.earlyHitRate ?? 0,
        adjustedEarlyHitRate: stat?.adjustedEarlyHitRate ?? analysis.summary.baselineHitRate,
        baselineHitRate: stat?.baselineHitRate ?? analysis.summary.baselineHitRate,
        lift: stat?.lift ?? overallFactor,
        adjustedLift: stat?.adjustedLift ?? overallFactor,
        supportWeight: stat?.supportWeight ?? 0,
        factor,
        active: true,
      };
    })
    .sort((left, right) => right.factor - left.factor || right.monthEndsUndrawn - left.monthEndsUndrawn || left.number - right.number);

  const positiveActiveSignal = weightedNumbers.some((item) => item.factor > 1 + 1e-9);
  const earlyMonthDefaultWindow = drawsSoFarThisMonth < earlyDrawLimit;
  const defaultEnabled = earlyMonthDefaultWindow && positiveActiveSignal;
  const notes = [
    `${targetMonthLabel}: ${drawsSoFarThisMonth} draw${drawsSoFarThisMonth === 1 ? "" : "s"} recorded so far; default ${defaultEnabled ? "ON" : "OFF"} because the next draw ${earlyMonthDefaultWindow ? "still falls within" : "would be after"} the first ${earlyDrawLimit} draw${earlyDrawLimit === 1 ? "" : "s"} of the month${earlyMonthDefaultWindow && !positiveActiveSignal ? ", but no active carry-over number currently has a positive weight" : ""}.`,
    sourceSegment
      ? `${activeNumbers.length} active number${activeNumbers.length === 1 ? "" : "s"}: ${activeMonthEndUndrawnNumbers.length} enabled still-undrawn from ${sourceSegment.monthLabel}'s month-end undrawn set and ${activeBoundaryRepeatNumbers.length} enabled last-draw → first-draw carry-over number${activeBoundaryRepeatNumbers.length === 1 ? "" : "s"} into ${targetMonthLabel}.`
      : `No ${sourceMonthLabel ?? "previous-month"} segment is available in history, so no active month-end carry-over pool could be derived for ${targetMonthLabel}.`,
    ...realHistory.warnings,
    ...analysis.notes,
  ];

  if (activeBoundaryRepeatNumbers.length > 0) {
    notes.splice(2, 0, "Last-draw → first-draw carry-over numbers stay in the active pool even though they have already appeared in the current month.");
  }

  return {
    defaultEnabled,
    targetMonthLabel,
    sourceMonthLabel,
    drawsSoFarThisMonth,
    earlyDrawLimit,
    activeNumbers,
    monthEndUndrawnNumbers: activeMonthEndUndrawnNumbers,
    boundaryRepeatNumbers: activeBoundaryRepeatNumbers,
    weights,
    weightedNumbers,
    notes,
  };
}

export function scoreMonthEndCarryOverCandidate(
  numbers: number[],
  weights: Record<number, number> | undefined,
): { hits: number; delta: number; normalizedScore: number } {
  if (!weights) {
    return { hits: 0, delta: 0, normalizedScore: 0.5 };
  }

  const maxPerNumberDelta = Math.max(Math.abs(DEFAULT_WEIGHT_MAX - 1), Math.abs(1 - DEFAULT_WEIGHT_MIN));
  if (maxPerNumberDelta <= 0 || numbers.length === 0) {
    return { hits: 0, delta: 0, normalizedScore: 0.5 };
  }

  let hits = 0;
  let delta = 0;
  for (const number of numbers) {
    const factor = weights[number] ?? 1;
    if (Math.abs(factor - 1) < 1e-9) continue;
    hits += 1;
    delta += factor - 1;
  }

  const normalizedScore = clamp(0.5 + delta / (2 * numbers.length * maxPerNumberDelta), 0, 1);
  return { hits, delta, normalizedScore };
}

export default analyzeMonthEndCarryOver;
