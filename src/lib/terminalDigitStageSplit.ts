import type { Draw } from "../types";

export type TerminalDigitStageMetric = "occurrences" | "draw-presence";
export type TerminalDigitLowFamilyMode = "below-expected" | "bottom-three";
export type TerminalDigitMonthLengthFilter = "all" | number;

export interface TerminalDigitStageSplitOptions {
  includeSupp?: boolean;
  earlyDrawCount?: number;
  metric?: TerminalDigitStageMetric;
  lowFamilyMode?: TerminalDigitLowFamilyMode;
  monthLength?: TerminalDigitMonthLengthFilter;
  maxNumber?: number;
  resampleCount?: number;
  randomSeed?: number;
}

export interface TerminalDigitStageMonthEvidence {
  monthKey: string;
  drawCount: number;
  selectedDigits: number[];
  actual: number;
  expected: number;
  ratio: number | null;
  direction: "above" | "equal" | "below" | "unavailable";
}

interface TerminalDigitStageAggregate {
  eligibleMonths: number;
  averageSelectedDigits: number;
  actual: number;
  expected: number;
  ratio: number | null;
  aboveMonths: number;
  equalMonths: number;
  belowMonths: number;
}

export interface TerminalDigitStageCutoffRow extends TerminalDigitStageAggregate {
  earlyDrawCount: number;
  nextDrawTransitions: number;
  nextDrawActual: number;
  nextDrawExpected: number;
  nextDrawRatio: number | null;
}

export interface TerminalDigitStageNextDrawDigitEvidence {
  digit: number;
  familyNumbers: number[];
  trials: number;
  actual: number;
  expected: number;
  ratio: number | null;
  presenceHits: number;
  expectedPresenceHits: number;
}

export interface TerminalDigitStageNextDrawEvidence extends TerminalDigitStageAggregate {
  targetDrawNumber: number;
  liftPercent: number | null;
  confidenceInterval: { low: number; high: number } | null;
  randomComparisonPValue: number | null;
  monthsWithAnyHit: number;
  expectedMonthsWithAnyHit: number;
  olderPeriod: { months: number; ratio: number | null };
  newerPeriod: { months: number; ratio: number | null };
  digitRows: TerminalDigitStageNextDrawDigitEvidence[];
}

export interface TerminalDigitStageTranslationDistributionRow {
  hitCount: number;
  observedTransitions: number;
  observedPercent: number;
  randomExpectedTransitions: number;
  randomExpectedPercent: number;
}

export interface TerminalDigitStageTranslationAuditRow {
  monthKey: string;
  targetDrawNumber: number;
  targetDate: string;
  selectedDigits: number[];
  poolNumbers: number[];
  targetNumbers: number[];
  hitNumbers: number[];
  hitCount: number;
  expectedHits: number;
}

export type TerminalDigitStageTranslationCurrentState =
  | "awaiting-target"
  | "target-recorded"
  | "insufficient-early-block"
  | "unavailable";

export interface TerminalDigitStageCandidateTranslation {
  targetDrawNumber: number;
  eligibleTransitions: number;
  observedHits: number;
  expectedHits: number;
  observedAverageHits: number;
  expectedAverageHits: number;
  ratio: number | null;
  olderPeriod: { transitions: number; ratio: number | null };
  newerPeriod: { transitions: number; ratio: number | null };
  currentState: TerminalDigitStageTranslationCurrentState;
  currentSelectedDigits: number[];
  currentPoolNumbers: number[];
  distribution: TerminalDigitStageTranslationDistributionRow[];
  auditRows: TerminalDigitStageTranslationAuditRow[];
}

export interface TerminalDigitStageCurrentRow {
  digit: number;
  familyNumbers: number[];
  earlyActual: number;
  earlyExpected: number;
  earlyIndex: number | null;
  selected: boolean;
  postSplitActual: number;
  postSplitExpected: number;
}

export interface TerminalDigitStageCurrentMonth {
  monthKey: string;
  recordedDraws: number;
  expectedDraws: number;
  hasCompleteEarlyBlock: boolean;
  drawsNeededForEarlyBlock: number;
  selectedDigits: number[];
  postSplitActual: number;
  postSplitExpected: number;
  postSplitRatio: number | null;
  rows: TerminalDigitStageCurrentRow[];
  note: string;
}

export interface TerminalDigitStageSplitAnalysis {
  includeSupp: boolean;
  metric: TerminalDigitStageMetric;
  lowFamilyMode: TerminalDigitLowFamilyMode;
  monthLength: TerminalDigitMonthLengthFilter;
  earlyDrawCount: number;
  lateStartDraw: number;
  eligibleMonthCount: number;
  excludedIncompleteMonthCount: number;
  availableMonthLengths: number[];
  actual: number;
  expected: number;
  ratio: number | null;
  liftPercent: number | null;
  confidenceInterval: { low: number; high: number } | null;
  randomComparisonPValue: number | null;
  aboveMonths: number;
  equalMonths: number;
  belowMonths: number;
  olderPeriod: { months: number; ratio: number | null };
  newerPeriod: { months: number; ratio: number | null };
  nextDraw: TerminalDigitStageNextDrawEvidence;
  candidateTranslation: TerminalDigitStageCandidateTranslation;
  monthRows: TerminalDigitStageMonthEvidence[];
  cutoffRows: TerminalDigitStageCutoffRow[];
  currentMonth: TerminalDigitStageCurrentMonth | null;
  warnings: string[];
}

interface PreparedStageDraw {
  date: string;
  dateKey: string;
  timestamp: number;
  monthKey: string;
  numbers: number[];
}

interface PreparedStageMonth {
  monthKey: string;
  expectedDateKeys: string[];
  draws: PreparedStageDraw[];
  isComplete: boolean;
  isPrefixComplete: boolean;
}

interface DigitStageObservation {
  digit: number;
  familyNumbers: number[];
  earlyActual: number;
  earlyExpected: number;
  earlyIndex: number | null;
}

interface InternalMonthEvidence extends TerminalDigitStageMonthEvidence {
  laterDraws: PreparedStageDraw[];
}

const MIN_NUMBER = 1;
const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_EARLY_DRAW_COUNT = 6;
const DEFAULT_RESAMPLE_COUNT = 2_000;
const MONDAY_WEDNESDAY_FRIDAY = new Set([1, 3, 5]);
const EPSILON = 1e-9;

const clampInteger = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum)))
);

const terminalDigit = (number: number): number => ((number % 10) + 10) % 10;

const parseDrawDate = (rawDate: string): { timestamp: number; dateKey: string; monthKey: string } | null => {
  const iso = rawDate.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/);
  const slash = rawDate.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    year = Number(slash[3]);
    if (year < 100) year += 2000;
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return {
    timestamp: date.getTime(),
    dateKey: `${year}-${monthText}-${dayText}`,
    monthKey: `${year}-${monthText}`,
  };
};

const normalizeNumbers = (draw: Draw, includeSupp: boolean, maxNumber: number): number[] => {
  const source = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
  const unique = new Set<number>();
  source.forEach((number) => {
    if (Number.isInteger(number) && number >= MIN_NUMBER && number <= maxNumber) unique.add(number);
  });
  return [...unique];
};

const expectedDateKeysForMonth = (monthKey: string): string[] => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const keys: string[] = [];

  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (!MONDAY_WEDNESDAY_FRIDAY.has(date.getDay())) continue;
    keys.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return keys;
};

const prepareMonths = (draws: Draw[], includeSupp: boolean, maxNumber: number): PreparedStageMonth[] => {
  const grouped = new Map<string, PreparedStageDraw[]>();

  draws.forEach((draw) => {
    if (draw.isSimulated) return;
    const date = parseDrawDate(draw.date);
    if (!date) return;
    const numbers = normalizeNumbers(draw, includeSupp, maxNumber);
    if (!numbers.length) return;
    const prepared: PreparedStageDraw = { date: draw.date, numbers, ...date };
    const monthDraws = grouped.get(date.monthKey);
    if (monthDraws) monthDraws.push(prepared);
    else grouped.set(date.monthKey, [prepared]);
  });

  return [...grouped.entries()]
    .map(([monthKey, monthDraws]) => {
      const drawsSorted = monthDraws
        .slice()
        .sort((left, right) => left.timestamp - right.timestamp || left.dateKey.localeCompare(right.dateKey));
      const expectedDateKeys = expectedDateKeysForMonth(monthKey);
      const actualDateKeys = [...new Set(drawsSorted.map((draw) => draw.dateKey))];
      const isComplete = expectedDateKeys.length > 0
        && actualDateKeys.length === expectedDateKeys.length
        && actualDateKeys.every((key, index) => key === expectedDateKeys[index]);
      const isPrefixComplete = actualDateKeys.length > 0
        && actualDateKeys.every((key, index) => key === expectedDateKeys[index]);
      return {
        monthKey,
        expectedDateKeys,
        draws: drawsSorted,
        isComplete,
        isPrefixComplete,
      };
    })
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
};

const familyNumbersForDigit = (digit: number, maxNumber: number): number[] => {
  const numbers: number[] = [];
  for (let number = MIN_NUMBER; number <= maxNumber; number += 1) {
    if (terminalDigit(number) === digit) numbers.push(number);
  }
  return numbers;
};

const combinationRatio = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  const reducedK = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= reducedK; index += 1) {
    result *= (n - reducedK + index) / index;
  }
  return result;
};

const expectedPresencePerDraw = (familySize: number, drawSize: number, maxNumber: number): number => {
  if (familySize <= 0 || drawSize <= 0) return 0;
  return 1 - (combinationRatio(maxNumber - familySize, drawSize) / combinationRatio(maxNumber, drawSize));
};

const countDigitMetric = (
  draws: PreparedStageDraw[],
  digit: number,
  metric: TerminalDigitStageMetric,
): number => {
  if (metric === "occurrences") {
    return draws.reduce((sum, draw) => (
      sum + draw.numbers.filter((number) => terminalDigit(number) === digit).length
    ), 0);
  }
  return draws.reduce((sum, draw) => (
    sum + Number(draw.numbers.some((number) => terminalDigit(number) === digit))
  ), 0);
};

const expectedDigitMetric = (
  drawCount: number,
  familySize: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
): number => {
  if (metric === "occurrences") return drawCount * drawSize * (familySize / maxNumber);
  return drawCount * expectedPresencePerDraw(familySize, drawSize, maxNumber);
};

const observeEarlyDigits = (
  draws: PreparedStageDraw[],
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
): DigitStageObservation[] => {
  const earlyDraws = draws.slice(0, earlyDrawCount);
  return Array.from({ length: 10 }, (_, digit) => {
    const familyNumbers = familyNumbersForDigit(digit, maxNumber);
    const earlyActual = countDigitMetric(earlyDraws, digit, metric);
    const earlyExpected = expectedDigitMetric(earlyDraws.length, familyNumbers.length, drawSize, maxNumber, metric);
    return {
      digit,
      familyNumbers,
      earlyActual,
      earlyExpected,
      earlyIndex: earlyExpected > 0 ? earlyActual / earlyExpected : null,
    };
  });
};

const selectLowDigits = (
  observations: DigitStageObservation[],
  mode: TerminalDigitLowFamilyMode,
): number[] => {
  if (mode === "below-expected") {
    return observations
      .filter((row) => row.earlyExpected > 0 && row.earlyActual + EPSILON < row.earlyExpected)
      .map((row) => row.digit);
  }

  const sorted = observations
    .filter((row) => row.earlyIndex !== null)
    .slice()
    .sort((left, right) => (
      (left.earlyIndex ?? Number.POSITIVE_INFINITY) - (right.earlyIndex ?? Number.POSITIVE_INFINITY)
      || left.digit - right.digit
    ));
  const threshold = sorted[Math.min(2, sorted.length - 1)]?.earlyIndex;
  if (threshold === undefined || threshold === null) return [];
  return sorted
    .filter((row) => (row.earlyIndex ?? Number.POSITIVE_INFINITY) <= threshold + EPSILON)
    .map((row) => row.digit)
    .sort((left, right) => left - right);
};

const lateMetricForDigits = (
  laterDraws: PreparedStageDraw[],
  digits: number[],
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
): { actual: number; expected: number } => {
  let actual = 0;
  let expected = 0;
  digits.forEach((digit) => {
    const familySize = familyNumbersForDigit(digit, maxNumber).length;
    actual += countDigitMetric(laterDraws, digit, metric);
    expected += expectedDigitMetric(laterDraws.length, familySize, drawSize, maxNumber, metric);
  });
  return { actual, expected };
};

const directionFor = (actual: number, expected: number): TerminalDigitStageMonthEvidence["direction"] => {
  if (expected <= 0) return "unavailable";
  if (actual > expected + EPSILON) return "above";
  if (actual < expected - EPSILON) return "below";
  return "equal";
};

const buildMonthEvidence = (
  month: PreparedStageMonth,
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
  lowFamilyMode: TerminalDigitLowFamilyMode,
): InternalMonthEvidence => {
  const observations = observeEarlyDigits(month.draws, earlyDrawCount, drawSize, maxNumber, metric);
  const selectedDigits = selectLowDigits(observations, lowFamilyMode);
  const laterDraws = month.draws.slice(earlyDrawCount);
  const totals = lateMetricForDigits(laterDraws, selectedDigits, drawSize, maxNumber, metric);
  return {
    monthKey: month.monthKey,
    drawCount: month.draws.length,
    selectedDigits,
    actual: totals.actual,
    expected: totals.expected,
    ratio: totals.expected > 0 ? totals.actual / totals.expected : null,
    direction: directionFor(totals.actual, totals.expected),
    laterDraws,
  };
};

const buildNextDrawEvidence = (
  month: PreparedStageMonth,
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
  lowFamilyMode: TerminalDigitLowFamilyMode,
): InternalMonthEvidence => {
  const remainder = buildMonthEvidence(
    month,
    earlyDrawCount,
    drawSize,
    maxNumber,
    metric,
    lowFamilyMode,
  );
  const nextDraws = remainder.laterDraws.slice(0, 1);
  const totals = lateMetricForDigits(nextDraws, remainder.selectedDigits, drawSize, maxNumber, metric);
  return {
    ...remainder,
    actual: totals.actual,
    expected: totals.expected,
    ratio: totals.expected > 0 ? totals.actual / totals.expected : null,
    direction: directionFor(totals.actual, totals.expected),
    laterDraws: nextDraws,
  };
};

const poolNumbersForDigits = (digits: number[], maxNumber: number): number[] => (
  [...new Set(digits.flatMap((digit) => familyNumbersForDigit(digit, maxNumber)))]
    .sort((left, right) => left - right)
);

const buildTranslationAuditRow = (
  month: PreparedStageMonth,
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
  lowFamilyMode: TerminalDigitLowFamilyMode,
): TerminalDigitStageTranslationAuditRow | null => {
  const targetDraw = month.draws[earlyDrawCount];
  if (!targetDraw) return null;
  const observations = observeEarlyDigits(month.draws, earlyDrawCount, drawSize, maxNumber, metric);
  const selectedDigits = selectLowDigits(observations, lowFamilyMode);
  const poolNumbers = poolNumbersForDigits(selectedDigits, maxNumber);
  const pool = new Set(poolNumbers);
  const targetNumbers = targetDraw.numbers.slice();
  const hitNumbers = targetNumbers.filter((number) => pool.has(number));
  return {
    monthKey: month.monthKey,
    targetDrawNumber: earlyDrawCount + 1,
    targetDate: targetDraw.date,
    selectedDigits,
    poolNumbers,
    targetNumbers,
    hitNumbers,
    hitCount: hitNumbers.length,
    expectedHits: targetNumbers.length * (poolNumbers.length / maxNumber),
  };
};

const hypergeometricProbability = (
  populationSize: number,
  successCount: number,
  drawCount: number,
  hitCount: number,
): number => {
  if (
    populationSize <= 0
    || successCount < 0
    || successCount > populationSize
    || drawCount < 0
    || drawCount > populationSize
    || hitCount < 0
    || hitCount > successCount
    || drawCount - hitCount > populationSize - successCount
  ) return 0;
  const denominator = combinationRatio(populationSize, drawCount);
  if (denominator <= 0) return 0;
  return (
    combinationRatio(successCount, hitCount)
    * combinationRatio(populationSize - successCount, drawCount - hitCount)
  ) / denominator;
};

const translationRatioForRows = (rows: TerminalDigitStageTranslationAuditRow[]): number | null => {
  const actual = rows.reduce((sum, row) => sum + row.hitCount, 0);
  const expected = rows.reduce((sum, row) => sum + row.expectedHits, 0);
  return expected > 0 ? actual / expected : null;
};

const buildCandidateTranslation = (
  rows: TerminalDigitStageTranslationAuditRow[],
  currentMonth: TerminalDigitStageCurrentMonth | null,
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
): TerminalDigitStageCandidateTranslation => {
  const observedHits = rows.reduce((sum, row) => sum + row.hitCount, 0);
  const expectedHits = rows.reduce((sum, row) => sum + row.expectedHits, 0);
  const midpoint = Math.floor(rows.length / 2);
  const olderRows = rows.slice(0, midpoint);
  const newerRows = rows.slice(midpoint);
  const currentSelectedDigits = currentMonth?.hasCompleteEarlyBlock
    ? currentMonth.selectedDigits.slice()
    : [];
  const currentPoolNumbers = poolNumbersForDigits(currentSelectedDigits, maxNumber);
  let currentState: TerminalDigitStageTranslationCurrentState = "unavailable";
  if (currentMonth && !currentMonth.hasCompleteEarlyBlock) currentState = "insufficient-early-block";
  else if (currentMonth?.hasCompleteEarlyBlock) {
    currentState = currentMonth.recordedDraws > earlyDrawCount ? "target-recorded" : "awaiting-target";
  }

  const distribution = Array.from({ length: drawSize + 1 }, (_, hitCount) => {
    const observedTransitions = rows.filter((row) => row.hitCount === hitCount).length;
    const randomExpectedTransitions = rows.reduce((sum, row) => (
      sum + hypergeometricProbability(maxNumber, row.poolNumbers.length, row.targetNumbers.length, hitCount)
    ), 0);
    return {
      hitCount,
      observedTransitions,
      observedPercent: rows.length > 0 ? (observedTransitions / rows.length) * 100 : 0,
      randomExpectedTransitions,
      randomExpectedPercent: rows.length > 0 ? (randomExpectedTransitions / rows.length) * 100 : 0,
    };
  });

  return {
    targetDrawNumber: earlyDrawCount + 1,
    eligibleTransitions: rows.length,
    observedHits,
    expectedHits,
    observedAverageHits: rows.length > 0 ? observedHits / rows.length : 0,
    expectedAverageHits: rows.length > 0 ? expectedHits / rows.length : 0,
    ratio: expectedHits > 0 ? observedHits / expectedHits : null,
    olderPeriod: { transitions: olderRows.length, ratio: translationRatioForRows(olderRows) },
    newerPeriod: { transitions: newerRows.length, ratio: translationRatioForRows(newerRows) },
    currentState,
    currentSelectedDigits,
    currentPoolNumbers,
    distribution,
    auditRows: rows.slice().reverse(),
  };
};

const aggregateEvidence = (rows: InternalMonthEvidence[]): TerminalDigitStageAggregate => {
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  return {
    eligibleMonths: rows.length,
    averageSelectedDigits: rows.length
      ? rows.reduce((sum, row) => sum + row.selectedDigits.length, 0) / rows.length
      : 0,
    actual,
    expected,
    ratio: expected > 0 ? actual / expected : null,
    aboveMonths: rows.filter((row) => row.direction === "above").length,
    equalMonths: rows.filter((row) => row.direction === "equal").length,
    belowMonths: rows.filter((row) => row.direction === "below").length,
  };
};

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const quantile = (sorted: number[], probability: number): number => {
  if (!sorted.length) return Number.NaN;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const bootstrapRatioInterval = (
  rows: InternalMonthEvidence[],
  count: number,
  random: () => number,
): { low: number; high: number } | null => {
  if (rows.length < 2 || count <= 0) return null;
  const ratios: number[] = [];
  for (let sample = 0; sample < count; sample += 1) {
    let actual = 0;
    let expected = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[Math.floor(random() * rows.length)];
      actual += row.actual;
      expected += row.expected;
    }
    if (expected > 0) ratios.push(actual / expected);
  }
  ratios.sort((left, right) => left - right);
  if (!ratios.length) return null;
  return { low: quantile(ratios, 0.025), high: quantile(ratios, 0.975) };
};

const chooseRandomDigits = (count: number, random: () => number): number[] => {
  const digits = Array.from({ length: 10 }, (_, digit) => digit);
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [digits[index], digits[swapIndex]] = [digits[swapIndex], digits[index]];
  }
  return digits.slice(0, Math.min(count, digits.length));
};

const randomSubsetPValue = (
  rows: InternalMonthEvidence[],
  observedRatio: number | null,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
  count: number,
  random: () => number,
): number | null => {
  if (observedRatio === null || !rows.length || count <= 0) return null;
  let atLeastObserved = 0;
  let validSamples = 0;

  for (let sample = 0; sample < count; sample += 1) {
    let actual = 0;
    let expected = 0;
    rows.forEach((row) => {
      const digits = chooseRandomDigits(row.selectedDigits.length, random);
      const totals = lateMetricForDigits(row.laterDraws, digits, drawSize, maxNumber, metric);
      actual += totals.actual;
      expected += totals.expected;
    });
    if (expected <= 0) continue;
    validSamples += 1;
    if ((actual / expected) + EPSILON >= observedRatio) atLeastObserved += 1;
  }

  return validSamples > 0 ? (atLeastObserved + 1) / (validSamples + 1) : null;
};

const ratioForRows = (rows: InternalMonthEvidence[]): number | null => {
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  return expected > 0 ? actual / expected : null;
};

const expectedAnySelectedDigitHit = (
  selectedDigits: number[],
  drawSize: number,
  maxNumber: number,
): number => {
  const selectedNumberCount = selectedDigits.reduce(
    (sum, digit) => sum + familyNumbersForDigit(digit, maxNumber).length,
    0,
  );
  if (selectedNumberCount <= 0 || drawSize <= 0) return 0;
  return 1 - (combinationRatio(maxNumber - selectedNumberCount, drawSize) / combinationRatio(maxNumber, drawSize));
};

const buildNextDrawDigitRows = (
  rows: InternalMonthEvidence[],
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
): TerminalDigitStageNextDrawDigitEvidence[] => (
  Array.from({ length: 10 }, (_, digit) => {
    const qualifyingRows = rows.filter((row) => row.selectedDigits.includes(digit));
    const familyNumbers = familyNumbersForDigit(digit, maxNumber);
    const actual = qualifyingRows.reduce(
      (sum, row) => sum + countDigitMetric(row.laterDraws, digit, metric),
      0,
    );
    const expected = qualifyingRows.length > 0
      ? expectedDigitMetric(qualifyingRows.length, familyNumbers.length, drawSize, maxNumber, metric)
      : 0;
    const presenceHits = qualifyingRows.filter((row) => (
      row.laterDraws.some((draw) => draw.numbers.some((number) => terminalDigit(number) === digit))
    )).length;
    const expectedPresenceHits = qualifyingRows.length
      * expectedPresencePerDraw(familyNumbers.length, drawSize, maxNumber);
    return {
      digit,
      familyNumbers,
      trials: qualifyingRows.length,
      actual,
      expected,
      ratio: expected > 0 ? actual / expected : null,
      presenceHits,
      expectedPresenceHits,
    };
  })
);

const buildCurrentMonth = (
  month: PreparedStageMonth | undefined,
  earlyDrawCount: number,
  drawSize: number,
  maxNumber: number,
  metric: TerminalDigitStageMetric,
  lowFamilyMode: TerminalDigitLowFamilyMode,
): TerminalDigitStageCurrentMonth | null => {
  if (!month || month.isComplete) return null;
  const drawsNeededForEarlyBlock = Math.max(0, earlyDrawCount - month.draws.length);
  if (!month.isPrefixComplete) {
    return {
      monthKey: month.monthKey,
      recordedDraws: month.draws.length,
      expectedDraws: month.expectedDateKeys.length,
      hasCompleteEarlyBlock: false,
      drawsNeededForEarlyBlock,
      selectedDigits: [],
      postSplitActual: 0,
      postSplitExpected: 0,
      postSplitRatio: null,
      rows: [],
      note: "The active history does not contain an unbroken D1-to-current prefix for this month, so Windfall will not relabel a mid-month slice as D1.",
    };
  }

  if (drawsNeededForEarlyBlock > 0) {
    return {
      monthKey: month.monthKey,
      recordedDraws: month.draws.length,
      expectedDraws: month.expectedDateKeys.length,
      hasCompleteEarlyBlock: false,
      drawsNeededForEarlyBlock,
      selectedDigits: [],
      postSplitActual: 0,
      postSplitExpected: 0,
      postSplitRatio: null,
      rows: [],
      note: `The D1-D${earlyDrawCount} classification needs ${drawsNeededForEarlyBlock} more recorded draw${drawsNeededForEarlyBlock === 1 ? "" : "s"}.`,
    };
  }

  const observations = observeEarlyDigits(month.draws, earlyDrawCount, drawSize, maxNumber, metric);
  const selectedDigits = selectLowDigits(observations, lowFamilyMode);
  const laterDraws = month.draws.slice(earlyDrawCount);
  const postSplit = lateMetricForDigits(laterDraws, selectedDigits, drawSize, maxNumber, metric);
  const rows = observations.map<TerminalDigitStageCurrentRow>((row) => {
    const digitLater = lateMetricForDigits(laterDraws, [row.digit], drawSize, maxNumber, metric);
    return {
      ...row,
      selected: selectedDigits.includes(row.digit),
      postSplitActual: digitLater.actual,
      postSplitExpected: digitLater.expected,
    };
  });

  return {
    monthKey: month.monthKey,
    recordedDraws: month.draws.length,
    expectedDraws: month.expectedDateKeys.length,
    hasCompleteEarlyBlock: true,
    drawsNeededForEarlyBlock: 0,
    selectedDigits,
    postSplitActual: postSplit.actual,
    postSplitExpected: postSplit.expected,
    postSplitRatio: postSplit.expected > 0 ? postSplit.actual / postSplit.expected : null,
    rows,
    note: laterDraws.length
      ? `The current month has ${laterDraws.length} recorded post-split draw${laterDraws.length === 1 ? "" : "s"}; this is progress tracking, not an end-of-month result.`
      : "The early block is complete. Later-stage behavior has not yet been observed in the loaded history.",
  };
};

export const analyzeTerminalDigitStageSplit = (
  draws: Draw[],
  options: TerminalDigitStageSplitOptions = {},
): TerminalDigitStageSplitAnalysis => {
  const includeSupp = options.includeSupp ?? true;
  const drawSize = includeSupp ? 8 : 6;
  const maxNumber = clampInteger(options.maxNumber ?? DEFAULT_MAX_NUMBER, 10, DEFAULT_MAX_NUMBER);
  const earlyDrawCount = clampInteger(options.earlyDrawCount ?? DEFAULT_EARLY_DRAW_COUNT, 3, 10);
  const metric = options.metric ?? "occurrences";
  const lowFamilyMode = options.lowFamilyMode ?? "below-expected";
  const monthLength = options.monthLength ?? "all";
  const resampleCount = clampInteger(options.resampleCount ?? DEFAULT_RESAMPLE_COUNT, 0, 20_000);
  const months = prepareMonths(draws, includeSupp, maxNumber);
  const completeMonths = months.filter((month) => month.isComplete);
  const availableMonthLengths = [...new Set(completeMonths.map((month) => month.expectedDateKeys.length))]
    .sort((left, right) => left - right);
  const matchesMonthLength = (month: PreparedStageMonth): boolean => (
    monthLength === "all" || month.expectedDateKeys.length === monthLength
  );
  const eligibleCompleteMonths = completeMonths.filter((month) => (
    matchesMonthLength(month)
    && month.draws.length > earlyDrawCount
  ));
  const eligibleNextDrawMonths = months.filter((month) => (
    month.isPrefixComplete
    && matchesMonthLength(month)
    && month.draws.length > earlyDrawCount
  ));

  const monthRows = eligibleCompleteMonths.map((month) => buildMonthEvidence(
    month,
    earlyDrawCount,
    drawSize,
    maxNumber,
    metric,
    lowFamilyMode,
  ));
  const nextDrawRows = eligibleNextDrawMonths.map((month) => buildNextDrawEvidence(
    month,
    earlyDrawCount,
    drawSize,
    maxNumber,
    metric,
    lowFamilyMode,
  ));
  const aggregate = aggregateEvidence(monthRows);
  const randomSeed = options.randomSeed ?? 0x51a6e5;
  const random = createRandom(randomSeed);
  const confidenceInterval = bootstrapRatioInterval(monthRows, resampleCount, random);
  const randomComparisonPValue = randomSubsetPValue(
    monthRows,
    aggregate.ratio,
    drawSize,
    maxNumber,
    metric,
    resampleCount,
    random,
  );
  const midpoint = Math.floor(monthRows.length / 2);
  const olderRows = monthRows.slice(0, midpoint);
  const newerRows = monthRows.slice(midpoint);
  const nextDrawAggregate = aggregateEvidence(nextDrawRows);
  const nextDrawRandom = createRandom(randomSeed ^ 0x9e3779b9);
  const nextDrawConfidenceInterval = bootstrapRatioInterval(nextDrawRows, resampleCount, nextDrawRandom);
  const nextDrawRandomComparisonPValue = randomSubsetPValue(
    nextDrawRows,
    nextDrawAggregate.ratio,
    drawSize,
    maxNumber,
    metric,
    resampleCount,
    nextDrawRandom,
  );
  const nextDrawMidpoint = Math.floor(nextDrawRows.length / 2);
  const nextDrawOlderRows = nextDrawRows.slice(0, nextDrawMidpoint);
  const nextDrawNewerRows = nextDrawRows.slice(nextDrawMidpoint);
  const latestMonth = months[months.length - 1];
  const currentMonth = buildCurrentMonth(
    latestMonth,
    earlyDrawCount,
    drawSize,
    maxNumber,
    metric,
    lowFamilyMode,
  );
  const translationRows = eligibleNextDrawMonths
    .map((month) => buildTranslationAuditRow(
      month,
      earlyDrawCount,
      drawSize,
      maxNumber,
      metric,
      lowFamilyMode,
    ))
    .filter((row): row is TerminalDigitStageTranslationAuditRow => row !== null);
  const candidateTranslation = buildCandidateTranslation(
    translationRows,
    currentMonth,
    earlyDrawCount,
    drawSize,
    maxNumber,
  );

  const cutoffRows = Array.from({ length: 8 }, (_, index) => index + 3).map((cutoff) => {
    const cutoffMonths = completeMonths.filter((month) => (
      matchesMonthLength(month)
      && month.draws.length > cutoff
    ));
    const cutoffTransitionMonths = months.filter((month) => (
      month.isPrefixComplete
      && matchesMonthLength(month)
      && month.draws.length > cutoff
    ));
    const rows = cutoffMonths.map((month) => (
      buildMonthEvidence(month, cutoff, drawSize, maxNumber, metric, lowFamilyMode)
    ));
    const nextRows = cutoffTransitionMonths.map((month) => (
      buildNextDrawEvidence(month, cutoff, drawSize, maxNumber, metric, lowFamilyMode)
    ));
    const nextAggregate = aggregateEvidence(nextRows);
    return {
      ...aggregateEvidence(rows),
      earlyDrawCount: cutoff,
      nextDrawTransitions: nextRows.length,
      nextDrawActual: nextAggregate.actual,
      nextDrawExpected: nextAggregate.expected,
      nextDrawRatio: nextAggregate.ratio,
    };
  });

  const warnings: string[] = [];
  if (eligibleCompleteMonths.length < 8) {
    warnings.push(`Only ${eligibleCompleteMonths.length} complete comparable month${eligibleCompleteMonths.length === 1 ? "" : "s"} are available for the remainder-of-month test; treat the result as thin evidence.`);
  }
  if (eligibleNextDrawMonths.length < 8) {
    warnings.push(`Only ${eligibleNextDrawMonths.length} valid D1-to-D${earlyDrawCount + 1} transition${eligibleNextDrawMonths.length === 1 ? "" : "s"} are available for the immediate replay; treat the result as thin evidence.`);
  }
  if (monthLength !== "all" && !availableMonthLengths.includes(monthLength)) {
    warnings.push(`No complete ${monthLength}-draw months are available in this history source.`);
  }
  warnings.push("Cutoff comparison rows are exploratory and are not corrected for trying several split points. Do not promote the strongest row to a prediction without forward validation.");

  return {
    includeSupp,
    metric,
    lowFamilyMode,
    monthLength,
    earlyDrawCount,
    lateStartDraw: earlyDrawCount + 1,
    eligibleMonthCount: monthRows.length,
    excludedIncompleteMonthCount: months.filter((month) => !month.isComplete).length,
    availableMonthLengths,
    actual: aggregate.actual,
    expected: aggregate.expected,
    ratio: aggregate.ratio,
    liftPercent: aggregate.ratio === null ? null : (aggregate.ratio - 1) * 100,
    confidenceInterval,
    randomComparisonPValue,
    aboveMonths: aggregate.aboveMonths,
    equalMonths: aggregate.equalMonths,
    belowMonths: aggregate.belowMonths,
    olderPeriod: { months: olderRows.length, ratio: ratioForRows(olderRows) },
    newerPeriod: { months: newerRows.length, ratio: ratioForRows(newerRows) },
    nextDraw: {
      ...nextDrawAggregate,
      targetDrawNumber: earlyDrawCount + 1,
      liftPercent: nextDrawAggregate.ratio === null ? null : (nextDrawAggregate.ratio - 1) * 100,
      confidenceInterval: nextDrawConfidenceInterval,
      randomComparisonPValue: nextDrawRandomComparisonPValue,
      monthsWithAnyHit: nextDrawRows.filter((row) => row.actual > 0).length,
      expectedMonthsWithAnyHit: nextDrawRows.reduce(
        (sum, row) => sum + expectedAnySelectedDigitHit(row.selectedDigits, drawSize, maxNumber),
        0,
      ),
      olderPeriod: { months: nextDrawOlderRows.length, ratio: ratioForRows(nextDrawOlderRows) },
      newerPeriod: { months: nextDrawNewerRows.length, ratio: ratioForRows(nextDrawNewerRows) },
      digitRows: buildNextDrawDigitRows(nextDrawRows, drawSize, maxNumber, metric),
    },
    candidateTranslation,
    monthRows: monthRows.map(({ laterDraws: _laterDraws, ...row }) => row),
    cutoffRows,
    currentMonth,
    warnings,
  };
};
