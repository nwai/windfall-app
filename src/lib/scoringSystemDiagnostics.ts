import type { Draw } from "../types";

export type ScoringDiagnosticsScope = "mains-plus-supps" | "mains";

export interface ScoringDiagnosticsOptions {
  scope?: ScoringDiagnosticsScope;
}

export interface ScoringDiagnosticsProvenance {
  scope: ScoringDiagnosticsScope;
  drawSize: 6 | 8;
  fullValidDraws: number;
  filteredValidDraws: number;
  fullSkippedDraws: number;
  filteredSkippedDraws: number;
}

export interface OddEvenBlueprintRow {
  ratio: string;
  odd: number;
  even: number;
  totalCombinations: number;
  baselinePercent: number;
  baseScore: number;
}

export interface RatioDiagnosticRow extends OddEvenBlueprintRow {
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  fullObservedMinusBaseline: number;
  wfmqyhObservedMinusBaseline: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface NumberDiagnosticRow {
  number: number;
  terminalDigit: number;
  terminalDigitBaseScore: number;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface TerminalDigitDiagnosticRow {
  terminalDigit: number;
  baseScore: number;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface TerminalDigitSetDefinition {
  key: string;
  digits: number[];
}

export interface TerminalDigitSetExample {
  date: string;
  main: number[];
  supp: number[];
}

export interface TerminalDigitSetDiagnosticRow extends TerminalDigitSetDefinition {
  length: number;
  isStraightRun: boolean;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  fullContainedCount: number;
  fullContainedPercent: number;
  fullContainedScore: number;
  fullContainedMonths: string[];
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  wfmqyhContainedCount: number;
  wfmqyhContainedPercent: number;
  wfmqyhContainedScore: number;
  wfmqyhContainedMonths: string[];
  fullHistoryLengthCount: number;
  fullHistoryLengthScore: number;
  fullHistoryExamples: TerminalDigitSetExample[];
  fullContainedExamples: TerminalDigitSetExample[];
  wfmqyhLengthCount: number;
  wfmqyhLengthScore: number;
  wfmqyhExamples: TerminalDigitSetExample[];
  wfmqyhContainedExamples: TerminalDigitSetExample[];
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export type PredictionTerminalDigitHistoryBand = "common" | "typical" | "rare" | "never-seen";

export interface PredictionTerminalDigitHistory {
  digits: number[];
  key: string;
  length: number;
  validDraws: number;
  skippedDraws: number;
  exactCount: number;
  exactPercent: number;
  containedCount: number;
  containedPercent: number;
  peerRank: number | null;
  peerTotal: number;
  peerPercentile: number | null;
  band: PredictionTerminalDigitHistoryBand;
  latestExactExample: TerminalDigitSetExample | null;
  latestContainedExample: TerminalDigitSetExample | null;
}

export interface ScoringSystemDiagnosticsResult {
  provenance: ScoringDiagnosticsProvenance;
  ratioRows: RatioDiagnosticRow[];
  numberRows: NumberDiagnosticRow[];
  terminalDigitRows: TerminalDigitDiagnosticRow[];
  terminalDigitSetRows: TerminalDigitSetDiagnosticRow[];
  straightRunRows: TerminalDigitSetDiagnosticRow[];
}

const MAX_NUMBER = 45;
const ODD_POOL_SIZE = 23;
const EVEN_POOL_SIZE = 22;
const TERMINAL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const round2 = (value: number): number => Number(value.toFixed(2));

export const scoreFromPercent = (percent: number): number => Math.round(round2(percent) * 100);

export const combination = (n: number, k: number): number => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= effectiveK; i += 1) {
    result = (result * (n - effectiveK + i)) / i;
  }
  return Math.round(result);
};

export const terminalDigitForNumber = (number: number): number => {
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return Number.NaN;
  return number % 10;
};

export const terminalDigitBaseScoreForNumber = (number: number): number => {
  const digit = terminalDigitForNumber(number);
  return digit >= 1 && digit <= 5 ? 11.11 : 8.89;
};

export interface ScoringMonthSearch {
  key: string;
  label: string;
}

const expandYear = (year: number): number => (year < 100 ? 2000 + year : year);

const monthKeyFromParts = (month: number, year: number): string | null => {
  const expandedYear = expandYear(year);
  if (!Number.isInteger(month) || !Number.isInteger(expandedYear) || month < 1 || month > 12) return null;
  if (expandedYear < 1900 || expandedYear > 2200) return null;
  return `${expandedYear}-${String(month).padStart(2, "0")}`;
};

const labelForMonthKey = (key: string): string => {
  const [year, month] = key.split("-");
  const monthIndex = Number(month) - 1;
  return `${MONTH_LABELS[monthIndex] ?? month} ${year}`;
};

export const normalizeScoringMonthSearch = (input: string): ScoringMonthSearch | null => {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (isoMatch) {
    const key = monthKeyFromParts(Number(isoMatch[2]), Number(isoMatch[1]));
    return key ? { key, label: labelForMonthKey(key) } : null;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2}|\d{4})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const third = slashMatch[3] == null ? null : Number(slashMatch[3]);
    const month = third == null ? first : first <= 12 ? first : second;
    const year = third == null ? second : third;
    const key = monthKeyFromParts(month, year);
    return key ? { key, label: labelForMonthKey(key) } : null;
  }

  const monthNameMatch = value.match(/^([a-z]+)\s+(\d{2,4})$/);
  if (monthNameMatch) {
    const monthIndex = MONTH_NAMES.findIndex((name) => name.startsWith(monthNameMatch[1]));
    if (monthIndex < 0) return null;
    const key = monthKeyFromParts(monthIndex + 1, Number(monthNameMatch[2]));
    return key ? { key, label: labelForMonthKey(key) } : null;
  }

  return null;
};

export const normalizeTerminalDigitSetSearch = (input: string): string | null => {
  const digits = Array.from(input.matchAll(/\d/g), (match) => Number(match[0]));
  const uniqueDigits = [...new Set(digits)].sort((left, right) => left - right);
  if (uniqueDigits.length < 2 || uniqueDigits.length > 8) return null;
  return keyForDigits(uniqueDigits);
};

const isValidDrawNumber = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && Number.isFinite(value)
  && value >= 1
  && value <= MAX_NUMBER
);

const numbersForScope = (draw: Draw, scope: ScoringDiagnosticsScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const normalizeDrawNumbers = (draw: Draw, scope: ScoringDiagnosticsScope): number[] | null => {
  const expectedCount = scope === "mains" ? 6 : 8;
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const value of numbersForScope(draw, scope)) {
    if (!isValidDrawNumber(value) || seen.has(value)) return null;
    seen.add(value);
    numbers.push(value);
  }
  return numbers.length === expectedCount ? numbers : null;
};

const normalizeHistory = (draws: Draw[], scope: ScoringDiagnosticsScope): { rows: number[][]; skipped: number } => {
  const rows: number[][] = [];
  let skipped = 0;
  for (const draw of draws) {
    const normalized = normalizeDrawNumbers(draw, scope);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    rows.push(normalized);
  }
  return { rows, skipped };
};

const keyForDigits = (digits: readonly number[]): string => (
  [...digits].sort((left, right) => left - right).join(",")
);

const terminalDigitSetForNumbers = (numbers: readonly number[]): string => (
  keyForDigits([...new Set(numbers.map((number) => terminalDigitForNumber(number)))])
);

const keepLatestExamples = (
  examples: TerminalDigitSetExample[],
  nextExample: TerminalDigitSetExample,
): TerminalDigitSetExample[] => (
  [...examples, nextExample].slice(-3)
);

const addMonthEvidence = (
  months: Map<string, Set<string>>,
  key: string,
  date: string,
): void => {
  const normalized = normalizeScoringMonthSearch(date);
  if (!normalized) return;
  const existing = months.get(key) ?? new Set<string>();
  existing.add(normalized.key);
  months.set(key, existing);
};

const finalizeMonthEvidence = (months: Map<string, Set<string>>): Map<string, string[]> => {
  const finalized = new Map<string, string[]>();
  months.forEach((values, key) => {
    finalized.set(key, [...values].sort());
  });
  return finalized;
};

const buildTerminalDigitSetExamples = (
  draws: Draw[],
  scope: ScoringDiagnosticsScope,
): Map<string, TerminalDigitSetExample[]> => {
  const examples = new Map<string, TerminalDigitSetExample[]>();
  for (const draw of draws) {
    const normalized = normalizeDrawNumbers(draw, scope);
    if (!normalized) continue;
    const key = terminalDigitSetForNumbers(normalized);
    const existing = examples.get(key) ?? [];
    examples.set(key, keepLatestExamples(existing, {
      date: draw.date,
      main: [...draw.main],
      supp: [...(draw.supp ?? [])],
    }));
  }
  return examples;
};

const buildContainedTerminalDigitSetStats = (
  draws: Draw[],
  scope: ScoringDiagnosticsScope,
): { counts: Map<string, number>; examples: Map<string, TerminalDigitSetExample[]>; months: Map<string, string[]> } => {
  const counts = new Map<string, number>();
  const examples = new Map<string, TerminalDigitSetExample[]>();
  const months = new Map<string, Set<string>>();

  for (const draw of draws) {
    const normalized = normalizeDrawNumbers(draw, scope);
    if (!normalized) continue;
    const digits = [...new Set(normalized.map((number) => terminalDigitForNumber(number)))]
      .sort((left, right) => left - right);
    const example = {
      date: draw.date,
      main: [...draw.main],
      supp: [...(draw.supp ?? [])],
    };

    for (let length = 2; length <= Math.min(8, digits.length); length += 1) {
      for (const set of chooseDigitSets(digits, length)) {
        counts.set(set.key, (counts.get(set.key) ?? 0) + 1);
        const existing = examples.get(set.key) ?? [];
        examples.set(set.key, keepLatestExamples(existing, example));
        addMonthEvidence(months, set.key, draw.date);
      }
    }
  }

  return { counts, examples, months: finalizeMonthEvidence(months) };
};

const chooseDigitSets = (
  digits: readonly number[],
  length: number,
  start = 0,
  prefix: number[] = [],
  out: TerminalDigitSetDefinition[] = [],
): TerminalDigitSetDefinition[] => {
  if (prefix.length === length) {
    out.push({ digits: [...prefix], key: keyForDigits(prefix) });
    return out;
  }
  for (let index = start; index < digits.length; index += 1) {
    chooseDigitSets(digits, length, index + 1, [...prefix, digits[index]], out);
  }
  return out;
};

export const buildTerminalDigitSets = (): TerminalDigitSetDefinition[] => {
  const rows: TerminalDigitSetDefinition[] = [];
  for (let length = 2; length <= 8; length += 1) {
    rows.push(...chooseDigitSets(TERMINAL_DIGITS, length));
  }
  return rows;
};

const normalizeTerminalDigitValues = (values: readonly unknown[]): number[] => {
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) continue;
    if (parsed <= 9) seen.add(parsed);
    else if (parsed <= MAX_NUMBER) seen.add(parsed % 10);
  }
  return [...seen].sort((left, right) => left - right);
};

const digitSetIsContained = (candidate: readonly number[], drawDigits: Set<number>): boolean => (
  candidate.every((digit) => drawDigits.has(digit))
);

const terminalDigitHistoryBand = (
  containedCount: number,
  peerPercentile: number | null,
): PredictionTerminalDigitHistoryBand => {
  if (containedCount <= 0) return "never-seen";
  if (containedCount < 3 || peerPercentile == null || peerPercentile < 34) return "rare";
  if (containedCount >= 5 && peerPercentile >= 67) return "common";
  return "typical";
};

export const analyzePredictionTerminalDigitHistory = (
  realHistory: Draw[],
  terminalDigits: readonly unknown[],
  options: ScoringDiagnosticsOptions = {},
): PredictionTerminalDigitHistory | null => {
  const scope = options.scope ?? "mains-plus-supps";
  const digits = normalizeTerminalDigitValues(terminalDigits);
  if (digits.length === 0 || digits.length > 8) return null;

  const history = normalizeHistory(realHistory, scope);
  const key = keyForDigits(digits);
  let exactCount = 0;
  let containedCount = 0;
  let latestExactExample: TerminalDigitSetExample | null = null;
  let latestContainedExample: TerminalDigitSetExample | null = null;
  const peerCounts = new Map<string, number>();

  for (const draw of realHistory) {
    const normalized = normalizeDrawNumbers(draw, scope);
    if (!normalized) continue;
    const drawDigits = [...new Set(normalized.map((number) => terminalDigitForNumber(number)))]
      .sort((left, right) => left - right);
    const drawDigitSet = new Set(drawDigits);
    const drawKey = keyForDigits(drawDigits);
    const example = {
      date: draw.date,
      main: [...draw.main],
      supp: [...(draw.supp ?? [])],
    };

    if (drawKey === key) {
      exactCount += 1;
      latestExactExample = example;
    }

    if (digitSetIsContained(digits, drawDigitSet)) {
      containedCount += 1;
      latestContainedExample = example;
    }

    if (digits.length <= drawDigits.length) {
      for (const set of chooseDigitSets(drawDigits, digits.length)) {
        peerCounts.set(set.key, (peerCounts.get(set.key) ?? 0) + 1);
      }
    }
  }

  const peerDefinitions = chooseDigitSets(TERMINAL_DIGITS, digits.length);
  const peerValues = peerDefinitions.map((definition) => peerCounts.get(definition.key) ?? 0);
  const peerTotal = peerValues.length;
  const peerRank = peerTotal > 0 ? 1 + peerValues.filter((count) => count > containedCount).length : null;
  const peerPercentile = peerTotal > 0
    ? round2((peerValues.filter((count) => count <= containedCount).length / peerTotal) * 100)
    : null;

  return {
    digits,
    key,
    length: digits.length,
    validDraws: history.rows.length,
    skippedDraws: history.skipped,
    exactCount,
    exactPercent: percent(exactCount, history.rows.length),
    containedCount,
    containedPercent: percent(containedCount, history.rows.length),
    peerRank,
    peerTotal,
    peerPercentile,
    band: terminalDigitHistoryBand(containedCount, peerPercentile),
    latestExactExample,
    latestContainedExample,
  };
};

export const isStraightTerminalDigitRun = (digits: readonly number[]): boolean => {
  const sorted = [...digits].sort((left, right) => left - right);
  if (sorted.length < 2) return false;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) return false;
  }
  return true;
};

export const buildOddEvenBlueprint = (drawSize: 6 | 8): OddEvenBlueprintRow[] => {
  const denominator = combination(MAX_NUMBER, drawSize);
  return Array.from({ length: drawSize + 1 }, (_, even) => {
    const odd = drawSize - even;
    const totalCombinations = combination(ODD_POOL_SIZE, odd) * combination(EVEN_POOL_SIZE, even);
    const baselinePercent = denominator > 0 ? round2((totalCombinations / denominator) * 100) : 0;
    return {
      ratio: `${odd}:${even}`,
      odd,
      even,
      totalCombinations,
      baselinePercent,
      baseScore: scoreFromPercent(baselinePercent),
    };
  });
};

const percent = (count: number, total: number): number => (
  total > 0 ? round2((count / total) * 100) : 0
);

const countMap = <T extends string | number>(values: readonly T[]): Map<T, number> => {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
};

type RankableRow = {
  combinedDiagnosticScore: number;
  fullHistoryScore?: number;
  number?: number;
  terminalDigit?: number;
  odd?: number;
  ratio?: string;
  key?: string;
};

const stableRankKey = (row: RankableRow): number | string => {
  if (typeof row.number === "number") return row.number;
  if (typeof row.terminalDigit === "number") return row.terminalDigit;
  if (typeof row.odd === "number") return 100 - row.odd;
  return row.key ?? row.ratio ?? "";
};

const compareRankKey = (left: RankableRow, right: RankableRow): number => {
  const leftKey = stableRankKey(left);
  const rightKey = stableRankKey(right);
  if (typeof leftKey === "number" && typeof rightKey === "number") return leftKey - rightKey;
  return String(leftKey).localeCompare(String(rightKey));
};

const addRanks = <T extends RankableRow>(
  rows: T[],
): Array<T & { rank: number; fullHistoryRank: number | null; rankMovement: number | null }> => {
  const fullRanked = [...rows]
    .sort((left, right) => (right.fullHistoryScore ?? 0) - (left.fullHistoryScore ?? 0) || compareRankKey(left, right));
  const fullRanks = new Map<T, number>();
  fullRanked.forEach((row, index) => fullRanks.set(row, index + 1));

  return [...rows]
    .sort((left, right) => right.combinedDiagnosticScore - left.combinedDiagnosticScore || compareRankKey(left, right))
    .map((row, index) => {
      const rank = index + 1;
      const fullHistoryRank = fullRanks.get(row) ?? null;
      return {
        ...row,
        rank,
        fullHistoryRank,
        rankMovement: fullHistoryRank == null ? null : fullHistoryRank - rank,
      };
    });
};

export function analyzeScoringSystemDiagnostics(
  realHistory: Draw[],
  realFilteredHistory: Draw[],
  options: ScoringDiagnosticsOptions = {},
): ScoringSystemDiagnosticsResult {
  const scope = options.scope ?? "mains-plus-supps";
  const drawSize: 6 | 8 = scope === "mains" ? 6 : 8;
  const full = normalizeHistory(realHistory, scope);
  const filtered = normalizeHistory(realFilteredHistory, scope);
  const blueprint = buildOddEvenBlueprint(drawSize);

  const ratioForNumbers = (numbers: readonly number[]): string => {
    const odd = numbers.filter((number) => number % 2 !== 0).length;
    return `${odd}:${numbers.length - odd}`;
  };
  const fullRatios = countMap(full.rows.map(ratioForNumbers));
  const filteredRatios = countMap(filtered.rows.map(ratioForNumbers));

  const ratioRows = addRanks(blueprint.map((base) => {
    const fullHistoryCount = fullRatios.get(base.ratio) ?? 0;
    const wfmqyhCount = filteredRatios.get(base.ratio) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      ...base,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      fullObservedMinusBaseline: round2(fullHistoryPercent - base.baselinePercent),
      wfmqyhObservedMinusBaseline: round2(wfmqyhPercent - base.baselinePercent),
      combinedDiagnosticScore: base.baseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullNumberCounts = countMap(full.rows.flat());
  const filteredNumberCounts = countMap(filtered.rows.flat());
  const numberRows = addRanks(Array.from({ length: MAX_NUMBER }, (_, index) => {
    const number = index + 1;
    const terminalDigit = terminalDigitForNumber(number);
    const terminalDigitBaseScore = terminalDigitBaseScoreForNumber(number);
    const fullHistoryCount = fullNumberCounts.get(number) ?? 0;
    const wfmqyhCount = filteredNumberCounts.get(number) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      number,
      terminalDigit,
      terminalDigitBaseScore,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      combinedDiagnosticScore: terminalDigitBaseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullTerminalDigits = countMap(full.rows.flat().map(terminalDigitForNumber));
  const filteredTerminalDigits = countMap(filtered.rows.flat().map(terminalDigitForNumber));
  const terminalDigitRows = addRanks(TERMINAL_DIGITS.map((terminalDigit) => {
    const baseScore = terminalDigit >= 1 && terminalDigit <= 5 ? 11.11 : 8.89;
    const fullHistoryCount = fullTerminalDigits.get(terminalDigit) ?? 0;
    const wfmqyhCount = filteredTerminalDigits.get(terminalDigit) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length * drawSize);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length * drawSize);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      terminalDigit,
      baseScore,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      combinedDiagnosticScore: baseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullSetCounts = countMap(full.rows.map(terminalDigitSetForNumbers));
  const filteredSetCounts = countMap(filtered.rows.map(terminalDigitSetForNumbers));
  const fullSetExamples = buildTerminalDigitSetExamples(realHistory, scope);
  const filteredSetExamples = buildTerminalDigitSetExamples(realFilteredHistory, scope);
  const fullContainedStats = buildContainedTerminalDigitSetStats(realHistory, scope);
  const filteredContainedStats = buildContainedTerminalDigitSetStats(realFilteredHistory, scope);
  const fullLengthCounts = countMap(full.rows.map((numbers) => terminalDigitSetForNumbers(numbers).split(",").filter(Boolean).length));
  const filteredLengthCounts = countMap(filtered.rows.map((numbers) => terminalDigitSetForNumbers(numbers).split(",").filter(Boolean).length));
  const terminalDigitSetRows = addRanks(buildTerminalDigitSets().map((definition) => {
    const fullHistoryCount = fullSetCounts.get(definition.key) ?? 0;
    const wfmqyhCount = filteredSetCounts.get(definition.key) ?? 0;
    const fullContainedCount = fullContainedStats.counts.get(definition.key) ?? 0;
    const wfmqyhContainedCount = filteredContainedStats.counts.get(definition.key) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullContainedPercent = percent(fullContainedCount, full.rows.length);
    const wfmqyhContainedPercent = percent(wfmqyhContainedCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    const fullContainedScore = scoreFromPercent(fullContainedPercent);
    const wfmqyhContainedScore = scoreFromPercent(wfmqyhContainedPercent);
    const fullHistoryLengthCount = fullLengthCounts.get(definition.digits.length) ?? 0;
    const wfmqyhLengthCount = filteredLengthCounts.get(definition.digits.length) ?? 0;
    const fullHistoryLengthScore = scoreFromPercent(percent(fullHistoryLengthCount, full.rows.length));
    const wfmqyhLengthScore = scoreFromPercent(percent(wfmqyhLengthCount, filtered.rows.length));
    return {
      ...definition,
      length: definition.digits.length,
      isStraightRun: isStraightTerminalDigitRun(definition.digits),
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      fullContainedCount,
      fullContainedPercent,
      fullContainedScore,
      fullContainedMonths: fullContainedStats.months.get(definition.key) ?? [],
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      wfmqyhContainedCount,
      wfmqyhContainedPercent,
      wfmqyhContainedScore,
      wfmqyhContainedMonths: filteredContainedStats.months.get(definition.key) ?? [],
      fullHistoryLengthCount,
      fullHistoryLengthScore,
      fullHistoryExamples: fullSetExamples.get(definition.key) ?? [],
      fullContainedExamples: fullContainedStats.examples.get(definition.key) ?? [],
      wfmqyhLengthCount,
      wfmqyhLengthScore,
      wfmqyhExamples: filteredSetExamples.get(definition.key) ?? [],
      wfmqyhContainedExamples: filteredContainedStats.examples.get(definition.key) ?? [],
      combinedDiagnosticScore: fullHistoryScore + wfmqyhScore + fullContainedScore + wfmqyhContainedScore + fullHistoryLengthScore + wfmqyhLengthScore,
    };
  }));

  return {
    provenance: {
      scope,
      drawSize,
      fullValidDraws: full.rows.length,
      filteredValidDraws: filtered.rows.length,
      fullSkippedDraws: full.skipped,
      filteredSkippedDraws: filtered.skipped,
    },
    ratioRows,
    numberRows,
    terminalDigitRows,
    terminalDigitSetRows,
    straightRunRows: terminalDigitSetRows.filter((row) => row.isStraightRun),
  };
}
