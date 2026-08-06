import type { Draw } from "../types";
import { analyzeHotColdRanking } from "./hotColdRanking";

export interface EndingDigitSequenceRun {
  digits: number[];
  coveredNumbers: number;
}

export interface EndingDigitSequenceDrawStats {
  date: string;
  numbers: number[];
  endings: number[];
  maxRunLength: number;
  coveredNumbers: number;
  maxRuns: EndingDigitSequenceRun[];
}

export interface EndingDigitSequenceSummary {
  totalDraws: number;
  drawsWithMaxRunAtLeast3: number;
  drawsWithMaxRunAtLeast4: number;
  drawsWithMaxRunAtLeast5: number;
  drawsWithCoveredNumbersAtLeast3: number;
  drawsWithCoveredNumbersAtLeast4: number;
  maxRunLengthFrequency: Record<number, number>;
  coveredNumbersFrequency: Record<number, number>;
  perDraw: EndingDigitSequenceDrawStats[];
}

export interface AnalyzeEndingDigitSequencesOptions {
  includeSupp?: boolean;
}

export interface EndingDigitMonthOption {
  monthKey: string;
  monthLabel: string;
  drawCount: number;
  firstDate: string;
  lastDate: string;
}

export interface EndingDigitMonthStageContext {
  priorMonthsWithFirstDrawMultiple: number;
  priorMonthsWithoutFirstDrawMultiple: number;
  avgPostD1HitsWhenMultiple: number | null;
  avgPostD1HitsWhenNotMultiple: number | null;
  lift: number | null;
}

export interface EndingDigitMonthStageDigitRow {
  digit: number;
  familyNumbers: number[];
  firstDrawNumbers: number[];
  firstDrawHits: number;
  firstDrawMultiple: boolean;
  stageHits: number;
  stageUnique: number;
  stageBucketMix: number[];
  monthEndHits: number;
  monthEndUnique: number;
  monthEndBucketMix: number[];
  postStageHits: number;
  numbersAdvancedAfterStage: number;
  context: EndingDigitMonthStageContext;
}

export interface EndingDigitMonthStageAnalysis {
  monthKey: string;
  monthLabel: string;
  includeSupp: boolean;
  selectedDrawCount: number;
  totalDrawsInMonth: number;
  firstDrawDate: string;
  selectedDrawDates: string[];
  rows: EndingDigitMonthStageDigitRow[];
  warnings: string[];
}

export interface AnalyzeEndingDigitMonthStageOptions extends AnalyzeEndingDigitSequencesOptions {
  monthKey?: string;
  drawCount?: number;
  maxNumber?: number;
  maxBucket?: number;
}

export type D1TerminalMomentumStrength = "off" | "light" | "normal" | "strong";
export type D1TerminalMomentumStageMode = "early-unique" | "terminal-momentum" | "closed-review";

export interface D1TerminalMomentumPriorContext {
  d1MultiTrials: number;
  baselineTrials: number;
  nextHitRate: number | null;
  nextUniqueRate: number | null;
  baselineNextHitRate: number | null;
  baselineNextUniqueRate: number | null;
  hitLift: number | null;
  uniqueLift: number | null;
  avgNextHits: number | null;
  avgNextUniqueAdds: number | null;
  avgPostStageHits: number | null;
  avgPostStageUniqueAdds: number | null;
}

export interface D1TerminalMomentumDigitRow {
  digit: number;
  parity: "odd" | "even";
  familyNumbers: number[];
  d1Numbers: number[];
  stageNumbers: number[];
  d1Hits: number;
  d1Unique: number;
  stageHits: number;
  stageUnique: number;
  stageNewHits: number;
  stageNewUnique: number;
  currentStageMoving: boolean;
  suggestedStrength: D1TerminalMomentumStrength;
  reason: string;
  prior: D1TerminalMomentumPriorContext;
}

export interface D1TerminalMomentumAnalysis {
  monthKey: string;
  monthLabel: string;
  includeSupp: boolean;
  completedStageDrawCount: number;
  targetDrawNumber: number;
  totalDrawsInMonth: number;
  stageMode: D1TerminalMomentumStageMode;
  overallSuggestedStrength: D1TerminalMomentumStrength;
  activeRows: D1TerminalMomentumDigitRow[];
  rows: D1TerminalMomentumDigitRow[];
  warnings: string[];
}

export interface AnalyzeD1TerminalMomentumOptions extends AnalyzeEndingDigitMonthStageOptions {
  expectedDrawCount?: number;
}

export type EndingDigitPredictionLength = 3 | 4 | 5;
export type EndingDigitPredictionLengthChoice = EndingDigitPredictionLength | "auto";

export interface EndingDigitPredictionComponents {
  transition: number;
  endingHistory: number;
  adjacentCombos: number;
  observedShape: number;
  hotCold: number;
  runLengthPrior: number;
  recency: number;
}

export interface EndingDigitPredictionSequence {
  digits: number[];
  score: number;
  confidenceLabel: "low" | "moderate" | "high";
  components: EndingDigitPredictionComponents;
  drivers: string[];
  fullRunHits: number;
  comboContributors: EndingDigitComboContributor[];
}

export interface EndingDigitComboContributor {
  key: string;
  endings: number[];
  size: 2 | 3;
  score: number;
  count: number;
  longestRun: number;
  currentStreak: number;
  meanGap: number | null;
}

export interface EndingDigitWindowShapeTarget {
  lowMidHigh: {
    low: number;
    mid: number;
    high: number;
  };
  evenOdd: {
    even: number;
    odd: number;
  };
  sum: number;
  meanNumber: number;
}

export interface EndingDigitPredictionWindowShape {
  target: EndingDigitWindowShapeTarget;
  recentDraws: number;
}

export interface EndingDigitPredictionDigitScore {
  digit: number;
  endingHistory: number;
  hotCold: number;
  total: number;
}

export interface EndingDigitSequencePrediction {
  totalDraws: number;
  includeSupp: boolean;
  sequenceLength: EndingDigitPredictionLengthChoice;
  recentWindow: number;
  halfLife: number;
  topSequence: EndingDigitPredictionSequence | null;
  alternatives: EndingDigitPredictionSequence[];
  digitScores: EndingDigitPredictionDigitScore[];
  windowShape: EndingDigitPredictionWindowShape;
  runLengthPrior: Record<EndingDigitPredictionLength, number>;
  backtest: EndingDigitPredictionBacktest;
}

export interface PredictNextEndingDigitSequenceOptions extends AnalyzeEndingDigitSequencesOptions {
  sequenceLength?: EndingDigitPredictionLengthChoice;
  recentWindow?: number;
  halfLife?: number;
  backtestMinTrainingDraws?: number;
  skipBacktest?: boolean;
}

export interface EndingDigitPredictionBacktest {
  evaluatedTransitions: number;
  exactHits: number;
  partialHits: number;
  exactHitRate: number;
  partialHitRate: number;
  averageOverlap: number;
  calibratedLabel: EndingDigitPredictionSequence["confidenceLabel"];
}

interface PreparedDraw {
  date: string;
  numbers: number[];
  sourceIndex: number;
}

interface ComboStats {
  key: string;
  nums: number[];
  endings: number[];
  size: 2 | 3;
  indices: number[];
  count: number;
  longestRun: number;
  runsLen2: number;
  currentStreak: number;
  touchesLatest: boolean;
  lastSeen: number;
  meanGap: number | null;
  score: number;
}

const VALID_NUMBER_MIN = 1;
const VALID_NUMBER_MAX = 45;
const DEFAULT_MAX_BUCKET = 8;
const ENDING_DIGITS = Array.from({ length: 10 }, (_, index) => index);
const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/;
const SLASH_DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/;

const countFrequency = (values: number[]): Record<number, number> => {
  const freq = new Map<number, number>();
  values.forEach((value) => {
    freq.set(value, (freq.get(value) ?? 0) + 1);
  });
  return Object.fromEntries([...freq.entries()].sort((a, b) => a[0] - b[0]));
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const roundScore = (value: number): number => Math.round(value * 100) / 100;

const formatDigits = (digits: readonly number[]): string => digits.join("-");

const endingDigit = (number: number): number => ((number % 10) + 10) % 10;

const formatMonthLabel = (monthKey: string): string => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const [, year, month] = match;
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, 1));
};

const parseDrawDateForMonthStage = (
  rawDate: string | undefined,
  sourceIndex: number,
): { monthKey: string; timestamp: number } | null => {
  if (!rawDate) return null;

  const isoMatch = rawDate.match(ISO_DATE_RE);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return {
        monthKey: `${year}-${String(month).padStart(2, "0")}`,
        timestamp: date.getTime() + sourceIndex,
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
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return {
        monthKey: `${year}-${String(month).padStart(2, "0")}`,
        timestamp: date.getTime() + sourceIndex,
      };
    }
    return null;
  }

  const timestamp = Date.parse(rawDate);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return {
    monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    timestamp: timestamp + sourceIndex,
  };
};

const normalizeDrawNumbers = (draw: Draw, includeSupp: boolean): number[] => {
  const source = includeSupp ? [...(draw.main ?? []), ...(draw.supp ?? [])] : [...(draw.main ?? [])];
  const seen = new Set<number>();
  const numbers: number[] = [];

  for (const value of source) {
    if (!Number.isInteger(value) || value < VALID_NUMBER_MIN || value > VALID_NUMBER_MAX || seen.has(value)) {
      continue;
    }
    seen.add(value);
    numbers.push(value);
  }

  return numbers;
};

const prepareDraws = (draws: Draw[], includeSupp: boolean): PreparedDraw[] => {
  return draws
    .map((draw, sourceIndex) => {
      const timestamp = Date.parse(draw.date || "");
      return {
        date: draw.date || `(draw ${sourceIndex + 1})`,
        time: Number.isFinite(timestamp) ? timestamp : sourceIndex,
        numbers: normalizeDrawNumbers(draw, includeSupp),
        sourceIndex,
      };
    })
    .filter((draw) => draw.numbers.length > 0)
    .sort((left, right) => left.time - right.time || left.sourceIndex - right.sourceIndex)
    .map(({ date, numbers, sourceIndex }) => ({ date, numbers, sourceIndex }));
};

interface MonthStagePreparedDraw extends PreparedDraw {
  monthKey: string;
}

const prepareMonthStageDraws = (draws: Draw[], includeSupp: boolean): MonthStagePreparedDraw[] => {
  return draws
    .map((draw, sourceIndex) => {
      if (draw.isSimulated) return null;
      const dateInfo = parseDrawDateForMonthStage(draw.date, sourceIndex);
      if (!dateInfo) return null;
      const numbers = normalizeDrawNumbers(draw, includeSupp);
      if (!numbers.length) return null;
      return {
        date: draw.date || `(draw ${sourceIndex + 1})`,
        monthKey: dateInfo.monthKey,
        timestamp: dateInfo.timestamp,
        numbers,
        sourceIndex,
      };
    })
    .filter((draw): draw is MonthStagePreparedDraw & { timestamp: number } => draw !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.sourceIndex - right.sourceIndex)
    .map(({ date, monthKey, numbers, sourceIndex }) => ({ date, monthKey, numbers, sourceIndex }));
};

const groupMonthStageDraws = (draws: MonthStagePreparedDraw[]): Map<string, MonthStagePreparedDraw[]> => {
  const grouped = new Map<string, MonthStagePreparedDraw[]>();
  for (const draw of draws) {
    const monthDraws = grouped.get(draw.monthKey);
    if (monthDraws) monthDraws.push(draw);
    else grouped.set(draw.monthKey, [draw]);
  }
  return grouped;
};

const terminalDigitFamily = (digit: number, maxNumber: number): number[] => {
  const family: number[] = [];
  for (let number = VALID_NUMBER_MIN; number <= maxNumber; number += 1) {
    if (endingDigit(number) === digit) family.push(number);
  }
  return family;
};

const countsForDraws = (draws: MonthStagePreparedDraw[], maxNumber: number): number[] => {
  const counts = new Array(maxNumber + 1).fill(0);
  for (const draw of draws) {
    for (const number of draw.numbers) {
      if (number >= VALID_NUMBER_MIN && number <= maxNumber) counts[number] += 1;
    }
  }
  return counts;
};

const bucketMixForFamily = (familyNumbers: number[], counts: number[], maxBucket: number): number[] => {
  const mix = new Array(maxBucket + 1).fill(0);
  for (const number of familyNumbers) {
    const bucket = Math.min(Math.max(0, counts[number] ?? 0), maxBucket);
    mix[bucket] += 1;
  }
  return mix;
};

const sumCountsForFamily = (familyNumbers: number[], counts: number[]): number => (
  familyNumbers.reduce((sum, number) => sum + (counts[number] ?? 0), 0)
);

const uniqueCountForFamily = (familyNumbers: number[], counts: number[]): number => (
  familyNumbers.filter((number) => (counts[number] ?? 0) > 0).length
);

const average = (values: number[]): number | null => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
);

const rate = (values: boolean[]): number | null => (
  values.length ? values.filter(Boolean).length / values.length : null
);

const ratioOrNull = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
};

const strengthOrder: Record<D1TerminalMomentumStrength, number> = {
  off: 0,
  light: 1,
  normal: 2,
  strong: 3,
};

const maxStrength = (strengths: D1TerminalMomentumStrength[]): D1TerminalMomentumStrength => {
  return strengths.reduce<D1TerminalMomentumStrength>((best, strength) => (
    strengthOrder[strength] > strengthOrder[best] ? strength : best
  ), "off");
};

const chooseD1TerminalMomentumStrength = (
  args: {
    d1Hits: number;
    stageMode: D1TerminalMomentumStageMode;
    currentStageMoving: boolean;
    prior: D1TerminalMomentumPriorContext;
  },
): { strength: D1TerminalMomentumStrength; reason: string } => {
  const { d1Hits, stageMode, currentStageMoving, prior } = args;
  if (stageMode === "closed-review") {
    return { strength: "off", reason: "selected month stage is complete" };
  }
  if (d1Hits < 2) {
    return { strength: "off", reason: "no D1 multi-hit terminal signal" };
  }

  if (stageMode === "early-unique") {
    if (
      prior.d1MultiTrials >= 3
      && (prior.nextUniqueRate ?? 0) >= 0.65
      && (prior.nextHitRate ?? 0) >= 0.85
      && currentStageMoving
    ) {
      return { strength: "strong", reason: "early-stage unique expansion is well supported in prior same-stage months" };
    }
    if (
      prior.d1MultiTrials >= 2
      && (prior.nextUniqueRate ?? 0) >= 0.45
      && (prior.nextHitRate ?? 0) >= 0.75
    ) {
      return { strength: "normal", reason: "early-stage unique expansion has usable prior support" };
    }
    return { strength: "light", reason: "D1 multi-hit exists, but early unique evidence is still thin" };
  }

  if (
    prior.d1MultiTrials >= 3
    && currentStageMoving
    && (prior.nextHitRate ?? 0) >= 0.75
    && (prior.avgPostStageHits ?? 0) >= 7
  ) {
    return { strength: "strong", reason: "terminal family is still moving and prior same-stage months kept producing hits" };
  }
  if (
    currentStageMoving
    && ((prior.nextHitRate ?? 0) >= 0.6 || (prior.avgPostStageHits ?? 0) >= 5)
  ) {
    return { strength: "normal", reason: "terminal family is still moving with moderate prior same-stage support" };
  }
  return { strength: "light", reason: "D1 multi-hit exists, but current-stage momentum is limited" };
};

const buildD1MultiContext = (
  grouped: Map<string, MonthStagePreparedDraw[]>,
  selectedMonthKey: string,
  digit: number,
  maxNumber: number,
): EndingDigitMonthStageContext => {
  const family = terminalDigitFamily(digit, maxNumber);
  const whenMultiple: number[] = [];
  const whenNotMultiple: number[] = [];

  for (const [monthKey, monthDraws] of grouped.entries()) {
    if (monthKey >= selectedMonthKey || monthDraws.length < 2) continue;
    const firstDrawCounts = countsForDraws(monthDraws.slice(0, 1), maxNumber);
    const fullMonthCounts = countsForDraws(monthDraws, maxNumber);
    const firstDrawHits = sumCountsForFamily(family, firstDrawCounts);
    const postD1Hits = Math.max(0, sumCountsForFamily(family, fullMonthCounts) - firstDrawHits);
    if (firstDrawHits >= 2) whenMultiple.push(postD1Hits);
    else whenNotMultiple.push(postD1Hits);
  }

  const avgMultiple = average(whenMultiple);
  const avgNotMultiple = average(whenNotMultiple);
  const lift = avgMultiple !== null && avgNotMultiple !== null && avgNotMultiple > 0
    ? avgMultiple / avgNotMultiple
    : null;

  return {
    priorMonthsWithFirstDrawMultiple: whenMultiple.length,
    priorMonthsWithoutFirstDrawMultiple: whenNotMultiple.length,
    avgPostD1HitsWhenMultiple: avgMultiple,
    avgPostD1HitsWhenNotMultiple: avgNotMultiple,
    lift,
  };
};

export const buildEndingDigitMonthOptions = (
  draws: Draw[],
  options: AnalyzeEndingDigitSequencesOptions = {},
): EndingDigitMonthOption[] => {
  const prepared = prepareMonthStageDraws(draws, options.includeSupp ?? true);
  return [...groupMonthStageDraws(prepared).entries()]
    .map(([monthKey, monthDraws]) => ({
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      drawCount: monthDraws.length,
      firstDate: monthDraws[0]?.date ?? "",
      lastDate: monthDraws[monthDraws.length - 1]?.date ?? "",
    }))
    .sort((left, right) => right.monthKey.localeCompare(left.monthKey));
};

export const analyzeEndingDigitMonthStage = (
  draws: Draw[],
  options: AnalyzeEndingDigitMonthStageOptions = {},
): EndingDigitMonthStageAnalysis | null => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(VALID_NUMBER_MIN, Math.floor(options.maxNumber ?? VALID_NUMBER_MAX));
  const maxBucket = Math.max(1, Math.floor(options.maxBucket ?? DEFAULT_MAX_BUCKET));
  const prepared = prepareMonthStageDraws(draws, includeSupp);
  const grouped = groupMonthStageDraws(prepared);
  const monthOptions = buildEndingDigitMonthOptions(draws, { includeSupp });
  const selectedMonthKey = options.monthKey && grouped.has(options.monthKey)
    ? options.monthKey
    : monthOptions[0]?.monthKey ?? "";
  if (!selectedMonthKey) return null;

  const monthDraws = grouped.get(selectedMonthKey) ?? [];
  if (!monthDraws.length) return null;

  const requestedDrawCount = Math.floor(options.drawCount ?? 1);
  const selectedDrawCount = Math.min(
    monthDraws.length,
    Math.max(1, Number.isFinite(requestedDrawCount) ? requestedDrawCount : 1),
  );
  const selectedDraws = monthDraws.slice(0, selectedDrawCount);
  const firstDrawCounts = countsForDraws(monthDraws.slice(0, 1), maxNumber);
  const stageCounts = countsForDraws(selectedDraws, maxNumber);
  const monthEndCounts = countsForDraws(monthDraws, maxNumber);

  const rows = ENDING_DIGITS.map<EndingDigitMonthStageDigitRow>((digit) => {
    const familyNumbers = terminalDigitFamily(digit, maxNumber);
    const firstDrawNumbers = familyNumbers.filter((number) => (firstDrawCounts[number] ?? 0) > 0);
    const firstDrawHits = sumCountsForFamily(familyNumbers, firstDrawCounts);
    const stageHits = sumCountsForFamily(familyNumbers, stageCounts);
    const monthEndHits = sumCountsForFamily(familyNumbers, monthEndCounts);
    return {
      digit,
      familyNumbers,
      firstDrawNumbers,
      firstDrawHits,
      firstDrawMultiple: firstDrawHits >= 2,
      stageHits,
      stageUnique: uniqueCountForFamily(familyNumbers, stageCounts),
      stageBucketMix: bucketMixForFamily(familyNumbers, stageCounts, maxBucket),
      monthEndHits,
      monthEndUnique: uniqueCountForFamily(familyNumbers, monthEndCounts),
      monthEndBucketMix: bucketMixForFamily(familyNumbers, monthEndCounts, maxBucket),
      postStageHits: Math.max(0, monthEndHits - stageHits),
      numbersAdvancedAfterStage: familyNumbers.filter((number) => (monthEndCounts[number] ?? 0) > (stageCounts[number] ?? 0)).length,
      context: buildD1MultiContext(grouped, selectedMonthKey, digit, maxNumber),
    };
  });

  const warnings: string[] = [];
  if (options.drawCount !== undefined && selectedDrawCount !== Math.floor(options.drawCount)) {
    warnings.push(`Selected draw count was clamped to ${selectedDrawCount} for ${formatMonthLabel(selectedMonthKey)}.`);
  }
  if (selectedMonthKey === monthOptions[0]?.monthKey && selectedDrawCount < monthDraws.length) {
    warnings.push("Month-end buckets use all loaded rows for this month. If newer draws are missing, this is a partial month-end view.");
  }

  return {
    monthKey: selectedMonthKey,
    monthLabel: formatMonthLabel(selectedMonthKey),
    includeSupp,
    selectedDrawCount,
    totalDrawsInMonth: monthDraws.length,
    firstDrawDate: monthDraws[0]?.date ?? "",
    selectedDrawDates: selectedDraws.map((draw) => draw.date),
    rows,
    warnings,
  };
};

export const analyzeD1TerminalMomentum = (
  draws: Draw[],
  options: AnalyzeD1TerminalMomentumOptions = {},
): D1TerminalMomentumAnalysis | null => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(VALID_NUMBER_MIN, Math.floor(options.maxNumber ?? VALID_NUMBER_MAX));
  const prepared = prepareMonthStageDraws(draws, includeSupp);
  const grouped = groupMonthStageDraws(prepared);
  const monthOptions = buildEndingDigitMonthOptions(draws, { includeSupp });
  const selectedMonthKey = options.monthKey && grouped.has(options.monthKey)
    ? options.monthKey
    : monthOptions[0]?.monthKey ?? "";
  if (!selectedMonthKey) return null;

  const monthDraws = grouped.get(selectedMonthKey) ?? [];
  if (!monthDraws.length) return null;
  const expectedDrawCount = Math.max(
    monthDraws.length,
    Math.floor(Number.isFinite(options.expectedDrawCount) ? options.expectedDrawCount ?? monthDraws.length : monthDraws.length),
  );

  const requestedDrawCount = Math.floor(options.drawCount ?? 1);
  const completedStageDrawCount = Math.min(
    monthDraws.length,
    Math.max(1, Number.isFinite(requestedDrawCount) ? requestedDrawCount : 1),
  );
  const targetDrawNumber = completedStageDrawCount + 1;
  const stageMode: D1TerminalMomentumStageMode = targetDrawNumber > expectedDrawCount
    ? "closed-review"
    : targetDrawNumber <= 3
      ? "early-unique"
      : "terminal-momentum";

  const d1Counts = countsForDraws(monthDraws.slice(0, 1), maxNumber);
  const stageCounts = countsForDraws(monthDraws.slice(0, completedStageDrawCount), maxNumber);

  const rows = ENDING_DIGITS.map<D1TerminalMomentumDigitRow>((digit) => {
    const familyNumbers = terminalDigitFamily(digit, maxNumber);
    const d1Numbers = familyNumbers.filter((number) => (d1Counts[number] ?? 0) > 0);
    const stageNumbers = familyNumbers.filter((number) => (stageCounts[number] ?? 0) > 0);
    const d1Hits = sumCountsForFamily(familyNumbers, d1Counts);
    const d1Unique = uniqueCountForFamily(familyNumbers, d1Counts);
    const stageHits = sumCountsForFamily(familyNumbers, stageCounts);
    const stageUnique = uniqueCountForFamily(familyNumbers, stageCounts);
    const currentStageMoving = completedStageDrawCount <= 1 || stageHits > d1Hits || stageUnique > d1Unique;

    const multiNextHits: number[] = [];
    const multiNextUniqueAdds: number[] = [];
    const multiNextHitFlags: boolean[] = [];
    const multiNextUniqueFlags: boolean[] = [];
    const multiPostStageHits: number[] = [];
    const multiPostStageUniqueAdds: number[] = [];
    const baselineNextHitFlags: boolean[] = [];
    const baselineNextUniqueFlags: boolean[] = [];

    for (const [monthKey, priorMonthDraws] of grouped.entries()) {
      if (monthKey >= selectedMonthKey || priorMonthDraws.length <= completedStageDrawCount) continue;

      const priorD1Counts = countsForDraws(priorMonthDraws.slice(0, 1), maxNumber);
      const priorStageCounts = countsForDraws(priorMonthDraws.slice(0, completedStageDrawCount), maxNumber);
      const priorNextCounts = countsForDraws(priorMonthDraws.slice(completedStageDrawCount, completedStageDrawCount + 1), maxNumber);
      const priorFullCounts = countsForDraws(priorMonthDraws, maxNumber);
      const priorD1Hits = sumCountsForFamily(familyNumbers, priorD1Counts);
      const nextHits = sumCountsForFamily(familyNumbers, priorNextCounts);
      const nextUniqueAdds = familyNumbers.filter((number) => (
        (priorNextCounts[number] ?? 0) > 0 && (priorStageCounts[number] ?? 0) === 0
      )).length;
      const postStageHits = Math.max(0, sumCountsForFamily(familyNumbers, priorFullCounts) - sumCountsForFamily(familyNumbers, priorStageCounts));
      const postStageUniqueAdds = familyNumbers.filter((number) => (
        (priorFullCounts[number] ?? 0) > (priorStageCounts[number] ?? 0)
      )).length;

      if (priorD1Hits >= 2) {
        multiNextHits.push(nextHits);
        multiNextUniqueAdds.push(nextUniqueAdds);
        multiNextHitFlags.push(nextHits > 0);
        multiNextUniqueFlags.push(nextUniqueAdds > 0);
        multiPostStageHits.push(postStageHits);
        multiPostStageUniqueAdds.push(postStageUniqueAdds);
      } else {
        baselineNextHitFlags.push(nextHits > 0);
        baselineNextUniqueFlags.push(nextUniqueAdds > 0);
      }
    }

    const nextHitRate = rate(multiNextHitFlags);
    const nextUniqueRate = rate(multiNextUniqueFlags);
    const baselineNextHitRate = rate(baselineNextHitFlags);
    const baselineNextUniqueRate = rate(baselineNextUniqueFlags);
    const prior: D1TerminalMomentumPriorContext = {
      d1MultiTrials: multiNextHitFlags.length,
      baselineTrials: baselineNextHitFlags.length,
      nextHitRate,
      nextUniqueRate,
      baselineNextHitRate,
      baselineNextUniqueRate,
      hitLift: ratioOrNull(nextHitRate, baselineNextHitRate),
      uniqueLift: ratioOrNull(nextUniqueRate, baselineNextUniqueRate),
      avgNextHits: average(multiNextHits),
      avgNextUniqueAdds: average(multiNextUniqueAdds),
      avgPostStageHits: average(multiPostStageHits),
      avgPostStageUniqueAdds: average(multiPostStageUniqueAdds),
    };
    const strengthChoice = chooseD1TerminalMomentumStrength({
      d1Hits,
      stageMode,
      currentStageMoving,
      prior,
    });

    return {
      digit,
      parity: digit % 2 === 0 ? "even" : "odd",
      familyNumbers,
      d1Numbers,
      stageNumbers,
      d1Hits,
      d1Unique,
      stageHits,
      stageUnique,
      stageNewHits: Math.max(0, stageHits - d1Hits),
      stageNewUnique: Math.max(0, stageUnique - d1Unique),
      currentStageMoving,
      suggestedStrength: strengthChoice.strength,
      reason: strengthChoice.reason,
      prior,
    };
  });

  const activeRows = rows
    .filter((row) => row.d1Hits >= 2)
    .sort((left, right) => (
      strengthOrder[right.suggestedStrength] - strengthOrder[left.suggestedStrength]
      || right.d1Hits - left.d1Hits
      || (right.prior.nextUniqueRate ?? -1) - (left.prior.nextUniqueRate ?? -1)
      || (right.prior.nextHitRate ?? -1) - (left.prior.nextHitRate ?? -1)
      || left.digit - right.digit
    ));

  const warnings: string[] = [];
  if (options.drawCount !== undefined && completedStageDrawCount !== Math.floor(options.drawCount)) {
    warnings.push(`Selected draw count was clamped to ${completedStageDrawCount} for ${formatMonthLabel(selectedMonthKey)}.`);
  }
  if (stageMode === "closed-review") {
    warnings.push("The selected first-draw count reaches the end of the loaded month, so the SGI preview is internally off for the next in-month draw.");
  }

  return {
    monthKey: selectedMonthKey,
    monthLabel: formatMonthLabel(selectedMonthKey),
    includeSupp,
    completedStageDrawCount,
    targetDrawNumber,
    totalDrawsInMonth: expectedDrawCount,
    stageMode,
    overallSuggestedStrength: maxStrength(activeRows.map((row) => row.suggestedStrength)),
    activeRows,
    rows,
    warnings,
  };
};

const buildRuns = (endings: number[]): EndingDigitSequenceDrawStats["maxRuns"] => {
  const presentDigits = new Set(endings);
  const uniqueRuns: number[][] = [];

  for (let start = 0; start < 10; start += 1) {
    if (!presentDigits.has(start)) continue;
    const previous = (start + 9) % 10;
    if (presentDigits.has(previous)) continue;

    const digits = [start];
    let next = (start + 1) % 10;
    while (presentDigits.has(next)) {
      digits.push(next);
      next = (next + 1) % 10;
      if (digits.length > 10) break;
    }
    uniqueRuns.push(digits);
  }

  if (uniqueRuns.length === 0 && presentDigits.size === 10) {
    uniqueRuns.push([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }

  const maxRunLength = uniqueRuns.reduce((best, run) => Math.max(best, run.length), 0);
  const strongestRuns = uniqueRuns.filter((run) => run.length === maxRunLength);

  return strongestRuns.map((digits) => {
    const coveredSet = new Set(digits);
    return {
      digits,
      coveredNumbers: endings.filter((ending) => coveredSet.has(ending)).length,
    };
  });
};

export const analyzeEndingDigitSequences = (
  draws: Draw[],
  options: AnalyzeEndingDigitSequencesOptions = {},
): EndingDigitSequenceSummary => {
  const { includeSupp = true } = options;

  const perDraw = draws.map<EndingDigitSequenceDrawStats>((draw) => {
    const numbers = normalizeDrawNumbers(draw, includeSupp);
    const endings = numbers.map(endingDigit);
    const maxRuns = buildRuns(endings);
    const maxRunLength = maxRuns.reduce((best, run) => Math.max(best, run.digits.length), 0);
    const coveredNumbers = maxRuns.reduce((best, run) => Math.max(best, run.coveredNumbers), 0);

    return {
      date: draw.date,
      numbers,
      endings,
      maxRunLength,
      coveredNumbers,
      maxRuns,
    };
  });

  return {
    totalDraws: perDraw.length,
    drawsWithMaxRunAtLeast3: perDraw.filter((draw) => draw.maxRunLength >= 3).length,
    drawsWithMaxRunAtLeast4: perDraw.filter((draw) => draw.maxRunLength >= 4).length,
    drawsWithMaxRunAtLeast5: perDraw.filter((draw) => draw.maxRunLength >= 5).length,
    drawsWithCoveredNumbersAtLeast3: perDraw.filter((draw) => draw.coveredNumbers >= 3).length,
    drawsWithCoveredNumbersAtLeast4: perDraw.filter((draw) => draw.coveredNumbers >= 4).length,
    maxRunLengthFrequency: countFrequency(perDraw.map((draw) => draw.maxRunLength)),
    coveredNumbersFrequency: countFrequency(perDraw.map((draw) => draw.coveredNumbers)),
    perDraw,
  };
};

const buildCircularSequence = (start: number, length: EndingDigitPredictionLength): number[] => (
  Array.from({ length }, (_, offset) => (start + offset) % 10)
);

const buildCandidateSequences = (lengthChoice: EndingDigitPredictionLengthChoice): number[][] => {
  const lengths: EndingDigitPredictionLength[] = lengthChoice === "auto" ? [3, 4, 5] : [lengthChoice];
  return lengths.flatMap((length) => ENDING_DIGITS.map((start) => buildCircularSequence(start, length)));
};

const recencyWeight = (age: number, halfLife: number): number => (
  Math.exp((-Math.log(2) * age) / Math.max(1, halfLife))
);

const combinations = (numbers: number[], size: 2 | 3): number[][] => {
  const output: number[][] = [];
  if (size === 2) {
    for (let left = 0; left < numbers.length; left += 1) {
      for (let right = left + 1; right < numbers.length; right += 1) {
        output.push([numbers[left], numbers[right]]);
      }
    }
    return output;
  }

  for (let first = 0; first < numbers.length; first += 1) {
    for (let second = first + 1; second < numbers.length; second += 1) {
      for (let third = second + 1; third < numbers.length; third += 1) {
        output.push([numbers[first], numbers[second], numbers[third]]);
      }
    }
  }
  return output;
};

const mean = (values: number[]): number | null => (
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
);

const summarizeComboIndices = (indices: number[], latestIndex: number): Pick<ComboStats, "longestRun" | "runsLen2" | "currentStreak" | "touchesLatest" | "lastSeen" | "meanGap"> => {
  if (indices.length === 0) {
    return {
      longestRun: 0,
      runsLen2: 0,
      currentStreak: 0,
      touchesLatest: false,
      lastSeen: -1,
      meanGap: null,
    };
  }

  const gaps: number[] = [];
  const runs: Array<{ start: number; end: number; length: number }> = [];
  let start = indices[0];
  let previous = indices[0];

  for (let index = 1; index < indices.length; index += 1) {
    const current = indices[index];
    gaps.push(current - previous);
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    runs.push({ start, end: previous, length: previous - start + 1 });
    start = current;
    previous = current;
  }
  runs.push({ start, end: previous, length: previous - start + 1 });

  const lastSeen = indices[indices.length - 1];
  const latestRun = runs[runs.length - 1];
  const touchesLatest = lastSeen === latestIndex;

  return {
    longestRun: runs.reduce((best, run) => Math.max(best, run.length), 0),
    runsLen2: runs.filter((run) => run.length >= 2).length,
    currentStreak: touchesLatest ? latestRun.length : 0,
    touchesLatest,
    lastSeen,
    meanGap: mean(gaps),
  };
};

const buildAdjacentComboEvidence = (draws: PreparedDraw[]): ComboStats[] => {
  const maps: Record<2 | 3, Map<string, number[]>> = {
    2: new Map<string, number[]>(),
    3: new Map<string, number[]>(),
  };

  draws.forEach((draw, index) => {
    const sortedNumbers = [...draw.numbers].sort((left, right) => left - right);
    ([2, 3] as const).forEach((size) => {
      combinations(sortedNumbers, size).forEach((combo) => {
        const key = combo.join("-");
        const indices = maps[size].get(key) ?? [];
        indices.push(index);
        maps[size].set(key, indices);
      });
    });
  });

  const latestIndex = Math.max(0, draws.length - 1);
  const drawCount = Math.max(1, draws.length);
  const evidence: ComboStats[] = [];

  ([2, 3] as const).forEach((size) => {
    maps[size].forEach((indices, key) => {
      const nums = key.split("-").map(Number);
      const endings = Array.from(new Set(nums.map(endingDigit))).sort((left, right) => left - right);
      if (endings.length < 2) return;

      const stats = summarizeComboIndices(indices, latestIndex);
      const countScore = clamp01(indices.length / Math.max(2, drawCount * 0.35));
      const longestScore = clamp01(stats.longestRun / Math.max(2, Math.min(8, drawCount)));
      const runsScore = clamp01(stats.runsLen2 / Math.max(1, Math.floor(drawCount / 6)));
      const meanGapScore = stats.meanGap === null
        ? 0
        : clamp01(1 / (1 + stats.meanGap / Math.max(1, drawCount / 10)));
      const lastSeenScore = clamp01(1 - ((latestIndex - stats.lastSeen) / Math.max(1, drawCount)));
      const currentStreakScore = clamp01(stats.currentStreak / 3);
      const score = (
        countScore * 0.26
        + longestScore * 0.2
        + runsScore * 0.14
        + meanGapScore * 0.18
        + lastSeenScore * 0.14
        + currentStreakScore * 0.08
      ) * (size === 3 ? 1.08 : 1);

      evidence.push({
        key,
        nums,
        endings,
        size,
        indices,
        count: indices.length,
        ...stats,
        score,
      });
    });
  });

  return evidence.sort((left, right) => right.score - left.score || right.count - left.count || left.key.localeCompare(right.key));
};

const buildDigitHistoryScores = (draws: PreparedDraw[], halfLife: number): number[] => {
  const scores = Array(10).fill(0) as number[];
  draws.forEach((draw, index) => {
    const weight = recencyWeight(draws.length - 1 - index, halfLife);
    draw.numbers.forEach((number) => {
      scores[endingDigit(number)] += weight;
    });
  });
  const maxScore = Math.max(...scores, 0);
  return maxScore > 0 ? scores.map((score) => score / maxScore) : scores;
};

const buildHotColdDigitScores = (
  rawDraws: Draw[],
  includeSupp: boolean,
  recentWindow: number,
  halfLife: number,
): number[] => {
  const summary = analyzeHotColdRanking(rawDraws, { includeSupp, recentWindow, halfLife });
  const scores = Array(10).fill(0) as number[];

  ENDING_DIGITS.forEach((digit) => {
    const bucket = summary.rows.filter((row) => endingDigit(row.number) === digit);
    if (bucket.length === 0) return;
    const recentAverage = bucket.reduce((sum, row) => sum + row.recentRate, 0) / bucket.length;
    const weightedAverage = bucket.reduce((sum, row) => sum + row.weightedRate, 0) / bucket.length;
    const hotAverage = bucket.reduce((sum, row) => sum + Math.max(0, row.hotScore), 0) / bucket.length;
    const bestHot = bucket.reduce((best, row) => Math.max(best, row.hotScore), 0);
    scores[digit] = recentAverage * 0.32
      + weightedAverage * 0.32
      + clamp01(hotAverage / 3) * 0.24
      + clamp01(bestHot / 4) * 0.12;
  });

  const maxScore = Math.max(...scores, 0);
  return maxScore > 0 ? scores.map((score) => score / maxScore) : scores;
};

const buildWindowShape = (draws: PreparedDraw[], halfLife: number): EndingDigitPredictionWindowShape => {
  if (draws.length === 0) {
    return {
      recentDraws: 0,
      target: {
        lowMidHigh: { low: 0, mid: 0, high: 0 },
        evenOdd: { even: 0, odd: 0 },
        sum: 0,
        meanNumber: 0,
      },
    };
  }

  const totals = draws.reduce((acc, draw, index) => {
    const weight = recencyWeight(draws.length - 1 - index, halfLife);
    const low = draw.numbers.filter((number) => number <= 15).length;
    const mid = draw.numbers.filter((number) => number >= 16 && number <= 30).length;
    const high = draw.numbers.filter((number) => number >= 31).length;
    const even = draw.numbers.filter((number) => number % 2 === 0).length;
    const odd = draw.numbers.length - even;
    const sum = draw.numbers.reduce((total, number) => total + number, 0);

    acc.weight += weight;
    acc.low += low * weight;
    acc.mid += mid * weight;
    acc.high += high * weight;
    acc.even += even * weight;
    acc.odd += odd * weight;
    acc.sum += sum * weight;
    acc.count += draw.numbers.length * weight;
    return acc;
  }, { weight: 0, low: 0, mid: 0, high: 0, even: 0, odd: 0, sum: 0, count: 0 });

  const weight = Math.max(1e-9, totals.weight);
  const count = Math.max(1e-9, totals.count);

  return {
    recentDraws: draws.length,
    target: {
      lowMidHigh: {
        low: totals.low / weight,
        mid: totals.mid / weight,
        high: totals.high / weight,
      },
      evenOdd: {
        even: totals.even / weight,
        odd: totals.odd / weight,
      },
      sum: totals.sum / weight,
      meanNumber: totals.sum / count,
    },
  };
};

const scoreShapeCompatibility = (
  observed: EndingDigitWindowShapeTarget,
  target: EndingDigitWindowShapeTarget,
): number => {
  const observedCount = Math.max(1, observed.lowMidHigh.low + observed.lowMidHigh.mid + observed.lowMidHigh.high);
  const observedParityCount = Math.max(1, observed.evenOdd.even + observed.evenOdd.odd);
  const targetCount = Math.max(1, target.lowMidHigh.low + target.lowMidHigh.mid + target.lowMidHigh.high);
  const targetParityCount = Math.max(1, target.evenOdd.even + target.evenOdd.odd);
  const lowMidHighDistance = (
    Math.abs((observed.lowMidHigh.low / observedCount) - (target.lowMidHigh.low / targetCount))
    + Math.abs((observed.lowMidHigh.mid / observedCount) - (target.lowMidHigh.mid / targetCount))
    + Math.abs((observed.lowMidHigh.high / observedCount) - (target.lowMidHigh.high / targetCount))
  ) / 2;
  const parityDistance = Math.abs((observed.evenOdd.even / observedParityCount) - (target.evenOdd.even / targetParityCount));
  const meanDistance = Math.abs(observed.meanNumber - target.meanNumber) / 44;

  return clamp01(
    (1 - lowMidHighDistance) * 0.45
    + (1 - parityDistance) * 0.3
    + (1 - clamp01(meanDistance)) * 0.25,
  );
};

const scoreObservedShapeCompatibility = (
  draws: PreparedDraw[],
  digits: readonly number[],
  windowShape: EndingDigitPredictionWindowShape,
  halfLife: number,
): number => {
  const observedDraws = draws.filter((draw) => {
    const endings = new Set(draw.numbers.map(endingDigit));
    return digits.every((digit) => endings.has(digit));
  });
  if (observedDraws.length === 0 || windowShape.recentDraws === 0) return 0;
  const observedShape = buildWindowShape(observedDraws, halfLife);
  return scoreShapeCompatibility(observedShape.target, windowShape.target);
};

const buildStatsForPreparedDraw = (draw: PreparedDraw): EndingDigitSequenceDrawStats => {
  const endings = draw.numbers.map(endingDigit);
  const maxRuns = buildRuns(endings);
  const maxRunLength = maxRuns.reduce((best, run) => Math.max(best, run.digits.length), 0);
  const coveredNumbers = maxRuns.reduce((best, run) => Math.max(best, run.coveredNumbers), 0);

  return {
    date: draw.date,
    numbers: draw.numbers,
    endings,
    maxRunLength,
    coveredNumbers,
    maxRuns,
  };
};

const toPredictionLength = (value: number): EndingDigitPredictionLength | null => (
  value === 3 || value === 4 || value === 5 ? value : null
);

const buildRunLengthPrior = (
  stats: EndingDigitSequenceDrawStats[],
): Record<EndingDigitPredictionLength, number> => {
  const counts: Record<EndingDigitPredictionLength, number> = { 3: 1, 4: 1, 5: 1 };
  stats.forEach((draw) => {
    const length = toPredictionLength(draw.maxRunLength);
    if (length !== null) counts[length] += 1;
  });

  const total = counts[3] + counts[4] + counts[5];
  return {
    3: counts[3] / total,
    4: counts[4] / total,
    5: counts[5] / total,
  };
};

const buildConditionalRunLengthPrior = (
  stats: EndingDigitSequenceDrawStats[],
): Record<EndingDigitPredictionLength, number> => {
  if (stats.length < 2) return buildRunLengthPrior(stats);

  const latest = stats[stats.length - 1];
  const counts: Record<EndingDigitPredictionLength, number> = { 3: 1, 4: 1, 5: 1 };
  for (let index = 0; index < stats.length - 1; index += 1) {
    const current = stats[index];
    const next = stats[index + 1];
    if (current.maxRunLength !== latest.maxRunLength) continue;
    const length = toPredictionLength(next.maxRunLength);
    if (length !== null) counts[length] += 1;
  }

  const total = counts[3] + counts[4] + counts[5];
  return {
    3: counts[3] / total,
    4: counts[4] / total,
    5: counts[5] / total,
  };
};

const blendRunLengthPriors = (
  overall: Record<EndingDigitPredictionLength, number>,
  conditional: Record<EndingDigitPredictionLength, number>,
): Record<EndingDigitPredictionLength, number> => ({
  3: overall[3] * 0.45 + conditional[3] * 0.55,
  4: overall[4] * 0.45 + conditional[4] * 0.55,
  5: overall[5] * 0.45 + conditional[5] * 0.55,
});

const runOverlap = (left: readonly number[], right: readonly number[]): number => {
  const rightSet = new Set(right);
  const overlap = left.filter((digit) => rightSet.has(digit)).length;
  return overlap / Math.max(left.length, right.length, 1);
};

const bestRunOverlap = (
  leftRuns: readonly EndingDigitSequenceRun[],
  rightRuns: readonly EndingDigitSequenceRun[],
): number => {
  let best = 0;
  leftRuns.forEach((left) => {
    rightRuns.forEach((right) => {
      best = Math.max(best, runOverlap(left.digits, right.digits));
    });
  });
  return best;
};

const scoreTransitionTarget = (
  digits: readonly number[],
  targetRuns: readonly EndingDigitSequenceRun[],
): number => {
  let best = 0;
  targetRuns.forEach((run) => {
    const exact = run.digits.length === digits.length && formatDigits(run.digits) === formatDigits(digits);
    if (exact) {
      best = Math.max(best, 1);
      return;
    }
    const digitSet = new Set(digits);
    const overlap = run.digits.filter((digit) => digitSet.has(digit)).length;
    const candidateShare = overlap / Math.max(1, digits.length);
    const runShare = overlap / Math.max(1, run.digits.length);
    best = Math.max(best, candidateShare * 0.25 + runShare * 0.15);
  });
  return best;
};

const buildTransitionScores = (
  stats: EndingDigitSequenceDrawStats[],
  candidates: readonly number[][],
  halfLife: number,
): Map<string, number> => {
  const scores = new Map<string, number>();
  candidates.forEach((digits) => scores.set(formatDigits(digits), 0));
  if (stats.length < 3) return scores;

  const latest = stats[stats.length - 1];
  for (let index = 0; index < stats.length - 1; index += 1) {
    const source = stats[index];
    const next = stats[index + 1];
    const transitionAge = stats.length - 2 - index;
    const overlapSimilarity = bestRunOverlap(source.maxRuns, latest.maxRuns);
    const lengthSimilarity = clamp01(1 - Math.abs(source.maxRunLength - latest.maxRunLength) / 5);
    const coveredSimilarity = clamp01(1 - Math.abs(source.coveredNumbers - latest.coveredNumbers) / 8);
    const sourceSimilarity = overlapSimilarity * 0.55 + lengthSimilarity * 0.28 + coveredSimilarity * 0.17;
    if (sourceSimilarity <= 0) continue;
    const weight = sourceSimilarity * recencyWeight(transitionAge, halfLife);

    candidates.forEach((digits) => {
      const key = formatDigits(digits);
      const targetScore = scoreTransitionTarget(digits, next.maxRuns);
      scores.set(key, (scores.get(key) ?? 0) + weight * targetScore);
    });
  }

  const maxScore = Math.max(...scores.values(), 0);
  if (maxScore <= 0) return scores;
  scores.forEach((score, key) => scores.set(key, score / maxScore));
  return scores;
};

const countFullRunHits = (draws: PreparedDraw[], digits: readonly number[]): number => {
  return draws.filter((draw) => {
    const endingSet = new Set(draw.numbers.map(endingDigit));
    return digits.every((digit) => endingSet.has(digit));
  }).length;
};

const scoreSequenceHistory = (
  draws: PreparedDraw[],
  digits: readonly number[],
  digitHistoryScores: readonly number[],
  halfLife: number,
): { endingHistory: number; recency: number } => {
  if (draws.length === 0) return { endingHistory: 0, recency: 0 };

  const totalWeight = draws.reduce((sum, _draw, index) => sum + recencyWeight(draws.length - 1 - index, halfLife), 0);
  const weighted = draws.reduce((acc, draw, index) => {
    const weight = recencyWeight(draws.length - 1 - index, halfLife);
    const endingSet = new Set(draw.numbers.map(endingDigit));
    const overlap = digits.filter((digit) => endingSet.has(digit)).length;
    acc.partial += (overlap / digits.length) * weight;
    if (overlap === digits.length) acc.full += weight;
    return acc;
  }, { full: 0, partial: 0 });
  const digitAverage = digits.reduce((sum, digit) => sum + (digitHistoryScores[digit] ?? 0), 0) / digits.length;
  const lastDraw = draws[draws.length - 1];
  const lastEndingSet = new Set(lastDraw.numbers.map(endingDigit));
  const lastOverlap = digits.filter((digit) => lastEndingSet.has(digit)).length / digits.length;

  return {
    endingHistory: clamp01((digitAverage * 0.5) + ((weighted.full / totalWeight) * 0.3) + ((weighted.partial / totalWeight) * 0.2)),
    recency: clamp01((lastOverlap * 0.65) + ((weighted.full / totalWeight) * 0.35)),
  };
};

const getComboContributors = (
  digits: readonly number[],
  combos: readonly ComboStats[],
): EndingDigitComboContributor[] => {
  const digitSet = new Set(digits);
  return combos
    .filter((combo) => combo.endings.every((ending) => digitSet.has(ending)))
    .slice(0, 4)
    .map((combo) => ({
      key: combo.key,
      endings: combo.endings,
      size: combo.size,
      score: roundScore(combo.score),
      count: combo.count,
      longestRun: combo.longestRun,
      currentStreak: combo.currentStreak,
      meanGap: combo.meanGap,
    }));
};

const scoreComboRaw = (digits: readonly number[], combos: readonly ComboStats[]): number => {
  const digitSet = new Set(digits);
  return combos.reduce((sum, combo) => {
    const overlap = combo.endings.filter((ending) => digitSet.has(ending)).length;
    if (overlap === 0) return sum;
    const fullMatch = overlap === combo.endings.length;
    const multiplier = combo.size === 3 ? 1.15 : 1;
    return sum + combo.score * multiplier * (fullMatch ? 1 : 0.2 * (overlap / combo.endings.length));
  }, 0);
};

const confidenceLabel = (score: number): EndingDigitPredictionSequence["confidenceLabel"] => {
  if (score >= 72) return "high";
  if (score >= 48) return "moderate";
  return "low";
};

const emptyBacktest = (fallbackLabel: EndingDigitPredictionSequence["confidenceLabel"]): EndingDigitPredictionBacktest => ({
  evaluatedTransitions: 0,
  exactHits: 0,
  partialHits: 0,
  exactHitRate: 0,
  partialHitRate: 0,
  averageOverlap: 0,
  calibratedLabel: fallbackLabel,
});

const calibrateLabel = (
  partialHitRate: number,
  exactHitRate: number,
  evaluatedTransitions: number,
  fallbackLabel: EndingDigitPredictionSequence["confidenceLabel"],
): EndingDigitPredictionSequence["confidenceLabel"] => {
  if (evaluatedTransitions < 4) return fallbackLabel;
  if (partialHitRate >= 0.5 || exactHitRate >= 0.25) return "high";
  if (partialHitRate >= 0.25 || exactHitRate >= 0.1) return "moderate";
  return "low";
};

const buildBacktest = (
  draws: Draw[],
  options: Required<Pick<PredictNextEndingDigitSequenceOptions, "includeSupp">> & {
    sequenceLength: EndingDigitPredictionLengthChoice;
    recentWindow: number;
    halfLife: number;
    backtestMinTrainingDraws: number;
    fallbackLabel: EndingDigitPredictionSequence["confidenceLabel"];
  },
): EndingDigitPredictionBacktest => {
  if (draws.length <= options.backtestMinTrainingDraws) {
    return emptyBacktest(options.fallbackLabel);
  }

  let evaluatedTransitions = 0;
  let exactHits = 0;
  let partialHits = 0;
  let overlapTotal = 0;

  for (let index = options.backtestMinTrainingDraws; index < draws.length; index += 1) {
    const prediction = predictNextEndingDigitSequence(draws.slice(0, index), {
      includeSupp: options.includeSupp,
      sequenceLength: options.sequenceLength,
      recentWindow: options.recentWindow,
      halfLife: options.halfLife,
      skipBacktest: true,
    });
    const top = prediction.topSequence;
    const actual = analyzeEndingDigitSequences([draws[index]], { includeSupp: options.includeSupp }).perDraw[0];
    if (!top || !actual || actual.maxRuns.length === 0) continue;

    evaluatedTransitions += 1;
    const exact = actual.maxRuns.some((run) => formatDigits(run.digits) === formatDigits(top.digits));
    const overlap = scoreTransitionTarget(top.digits, actual.maxRuns);
    if (exact) exactHits += 1;
    if (overlap >= 0.6) partialHits += 1;
    overlapTotal += overlap;
  }

  if (evaluatedTransitions === 0) {
    return emptyBacktest(options.fallbackLabel);
  }

  const exactHitRate = exactHits / evaluatedTransitions;
  const partialHitRate = partialHits / evaluatedTransitions;
  return {
    evaluatedTransitions,
    exactHits,
    partialHits,
    exactHitRate,
    partialHitRate,
    averageOverlap: overlapTotal / evaluatedTransitions,
    calibratedLabel: calibrateLabel(partialHitRate, exactHitRate, evaluatedTransitions, options.fallbackLabel),
  };
};

const buildDrivers = (
  digits: readonly number[],
  sequence: Omit<EndingDigitPredictionSequence, "drivers">,
  totalDraws: number,
): string[] => {
  const drivers: string[] = [];
  const label = formatDigits(digits);

  if (sequence.fullRunHits > 0) {
    drivers.push(`Ending run history: ${label} appeared as a full run in ${sequence.fullRunHits}/${totalDraws} selected draws.`);
  }
  if (sequence.components.transition >= 0.5) {
    drivers.push(`Transition evidence: similar latest draw states have been followed by ${label}.`);
  }
  const strongestCombo = sequence.comboContributors[0];
  if (strongestCombo) {
    drivers.push(`Adjacent combo evidence: ${strongestCombo.key} maps into endings ${formatDigits(strongestCombo.endings)} with ${strongestCombo.count} hits.`);
  }
  if (sequence.components.hotCold >= 0.5) {
    drivers.push("Hot/cold evidence: recent, recency-weighted, and mover ranks align with these endings.");
  }
  if (sequence.components.observedShape >= 0.65) {
    drivers.push("Observed shape evidence: historical draws containing this run fit the current low/mid/high, odd/even, and mean-sum profile.");
  }
  if (sequence.components.runLengthPrior >= 0.65) {
    drivers.push("Run-length prior: this sequence length is common in the selected WFMQYH evidence.");
  }
  if (sequence.components.recency >= 0.5) {
    drivers.push("Recent ending pressure overlaps the latest WFMQYH draw pattern.");
  }

  return drivers.length > 0 ? drivers.slice(0, 4) : ["Evidence is diffuse; treat this as a weak exploratory signal."];
};

export const predictNextEndingDigitSequence = (
  draws: Draw[],
  options: PredictNextEndingDigitSequenceOptions = {},
): EndingDigitSequencePrediction => {
  const includeSupp = options.includeSupp ?? true;
  const sequenceLength = options.sequenceLength ?? "auto";
  const prepared = prepareDraws(draws, includeSupp);
  const totalDraws = prepared.length;
  const recentWindow = Math.min(Math.max(1, options.recentWindow ?? 20), Math.max(1, totalDraws));
  const halfLife = Math.min(Math.max(1, options.halfLife ?? 10), Math.max(1, totalDraws));
  const windowShape = buildWindowShape(prepared.slice(-recentWindow), halfLife);
  const fallbackRunLengthPrior: Record<EndingDigitPredictionLength, number> = { 3: 1 / 3, 4: 1 / 3, 5: 1 / 3 };

  if (totalDraws === 0) {
    return {
      totalDraws: 0,
      includeSupp,
      sequenceLength,
      recentWindow: 0,
      halfLife: 0,
      topSequence: null,
      alternatives: [],
      digitScores: ENDING_DIGITS.map((digit) => ({ digit, endingHistory: 0, hotCold: 0, total: 0 })),
      windowShape,
      runLengthPrior: fallbackRunLengthPrior,
      backtest: emptyBacktest("low"),
    };
  }

  const drawStats = prepared.map(buildStatsForPreparedDraw);
  const digitHistoryScores = buildDigitHistoryScores(prepared, halfLife);
  const hotColdScores = buildHotColdDigitScores(draws, includeSupp, recentWindow, halfLife);
  const combos = buildAdjacentComboEvidence(prepared);
  const candidates = buildCandidateSequences(sequenceLength);
  const overallRunLengthPrior = buildRunLengthPrior(drawStats);
  const conditionalRunLengthPrior = buildConditionalRunLengthPrior(drawStats);
  const runLengthPrior = blendRunLengthPriors(overallRunLengthPrior, conditionalRunLengthPrior);
  const maxRunLengthPrior = Math.max(runLengthPrior[3], runLengthPrior[4], runLengthPrior[5], 1e-9);
  const transitionScores = buildTransitionScores(drawStats, candidates, halfLife);

  const candidateBase = candidates.map((digits) => {
    const history = scoreSequenceHistory(prepared, digits, digitHistoryScores, halfLife);
    const length = toPredictionLength(digits.length) ?? 3;
    return {
      digits,
      comboRaw: scoreComboRaw(digits, combos),
      hotColdRaw: digits.reduce((sum, digit) => sum + (hotColdScores[digit] ?? 0), 0) / digits.length,
      observedShapeRaw: scoreObservedShapeCompatibility(prepared, digits, windowShape, halfLife),
      transitionRaw: transitionScores.get(formatDigits(digits)) ?? 0,
      runLengthPriorRaw: runLengthPrior[length] / maxRunLengthPrior,
      history,
      fullRunHits: countFullRunHits(prepared, digits),
      comboContributors: getComboContributors(digits, combos),
    };
  });

  const maxComboRaw = Math.max(...candidateBase.map((candidate) => candidate.comboRaw), 0);
  const ranked = candidateBase
    .map((candidate) => {
      const components: EndingDigitPredictionComponents = {
        transition: clamp01(candidate.transitionRaw),
        endingHistory: clamp01(candidate.history.endingHistory),
        adjacentCombos: maxComboRaw > 0 ? clamp01(candidate.comboRaw / maxComboRaw) : 0,
        observedShape: clamp01(candidate.observedShapeRaw),
        hotCold: clamp01(candidate.hotColdRaw),
        runLengthPrior: clamp01(candidate.runLengthPriorRaw),
        recency: clamp01(candidate.history.recency),
      };
      const score = roundScore(100 * (
        components.transition * 0.32
        + components.endingHistory * 0.13
        + components.adjacentCombos * 0.14
        + components.observedShape * 0.1
        + components.hotCold * 0.17
        + components.runLengthPrior * 0.09
        + components.recency * 0.05
      ));
      const sequenceWithoutDrivers = {
        digits: candidate.digits,
        score,
        confidenceLabel: confidenceLabel(score),
        components,
        fullRunHits: candidate.fullRunHits,
        comboContributors: candidate.comboContributors,
      };
      return {
        ...sequenceWithoutDrivers,
        drivers: buildDrivers(candidate.digits, sequenceWithoutDrivers, totalDraws),
      };
    })
    .sort((left, right) => right.score - left.score || left.digits.length - right.digits.length || formatDigits(left.digits).localeCompare(formatDigits(right.digits)));

  const digitScores = ENDING_DIGITS.map<EndingDigitPredictionDigitScore>((digit) => {
    const endingHistory = digitHistoryScores[digit] ?? 0;
    const hotCold = hotColdScores[digit] ?? 0;
    return {
      digit,
      endingHistory: roundScore(endingHistory * 100),
      hotCold: roundScore(hotCold * 100),
      total: roundScore(((endingHistory * 0.45) + (hotCold * 0.55)) * 100),
    };
  }).sort((left, right) => right.total - left.total || left.digit - right.digit);

  const heuristicTopLabel = ranked[0] ? confidenceLabel(ranked[0].score) : "low";
  const backtest = options.skipBacktest
    ? emptyBacktest(heuristicTopLabel)
    : buildBacktest(draws, {
      includeSupp,
      sequenceLength,
      recentWindow,
      halfLife,
      backtestMinTrainingDraws: Math.max(4, options.backtestMinTrainingDraws ?? 6),
      fallbackLabel: heuristicTopLabel,
    });
  const topSequence = ranked[0]
    ? { ...ranked[0], confidenceLabel: backtest.calibratedLabel }
    : null;

  return {
    totalDraws,
    includeSupp,
    sequenceLength,
    recentWindow,
    halfLife,
    topSequence,
    alternatives: ranked.slice(1, 5),
    digitScores,
    windowShape,
    runLengthPrior,
    backtest,
  };
};
