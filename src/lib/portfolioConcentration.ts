import type { PastedCandidateRow } from "./pasteWeightedCandidates";

const MAIN_SIZE = 6;
const MIN_LINE_COUNT = 2;
const MAX_LINE_COUNT = 12;
const MIN_CORE_RETENTION = 4;
const MAX_CORE_RETENTION = 5;
const DEFAULT_ALTERNATE_POOL_SIZE = 12;

export interface PortfolioConcentrationOptions {
  lineCount?: number;
  coreRetention?: 4 | 5;
  alternatePoolSize?: number;
}

export interface PortfolioConcentrationLine {
  index: number;
  role: "primary" | "hedge";
  numbers: number[];
  coreNumbers: number[];
  alternateNumbers: number[];
  newlyCoveredAlternates: number[];
  rowCountSupport: number;
  pairCooccurrenceSupport: number;
}

export interface PortfolioConcentrationResult {
  available: boolean;
  reason: string | null;
  validSourceRows: number;
  excludedSourceRows: number;
  requestedLines: number;
  coreRetention: 4 | 5;
  primaryCore: number[];
  alternatePool: number[];
  lines: PortfolioConcentrationLine[];
  outputUniqueNumbers: number[];
  warnings: string[];
  methodology: string[];
}

interface CandidateLine {
  numbers: number[];
  coreNumbers: number[];
  alternateNumbers: number[];
  rowCountSupport: number;
  pairCooccurrenceSupport: number;
}

const clampInteger = (value: number | undefined, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value ?? fallback)));
};

const normalizeCoreRetention = (value: number | undefined): 4 | 5 => (
  clampInteger(value, MIN_CORE_RETENTION, MIN_CORE_RETENTION, MAX_CORE_RETENTION) === MAX_CORE_RETENTION
    ? MAX_CORE_RETENTION
    : MIN_CORE_RETENTION
);

const validPortfolioRow = (row: PastedCandidateRow): boolean => (
  row.expectedCandidateNumbers
  && row.duplicateNumbers.length === 0
  && row.outOfRangeNumbers.length === 0
);

const sortedNumbers = (numbers: readonly number[]): number[] => (
  [...numbers].sort((left, right) => left - right)
);

const lineKey = (numbers: readonly number[]): string => sortedNumbers(numbers).join(",");

const pairKey = (left: number, right: number): string => (
  left < right ? `${left}-${right}` : `${right}-${left}`
);

const combinations = (values: readonly number[], count: number): number[][] => {
  if (count === 0) return [[]];
  if (count < 0 || values.length < count) return [];

  const output: number[][] = [];
  const working: number[] = [];

  const visit = (startIndex: number): void => {
    if (working.length === count) {
      output.push([...working]);
      return;
    }

    const remainingNeeded = count - working.length;
    for (let index = startIndex; index <= values.length - remainingNeeded; index += 1) {
      working.push(values[index]);
      visit(index + 1);
      working.pop();
    }
  };

  visit(0);
  return output;
};

const countPairSupport = (
  numbers: readonly number[],
  pairCounts: ReadonlyMap<string, number>,
): number => {
  let total = 0;
  for (let leftIndex = 0; leftIndex < numbers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < numbers.length; rightIndex += 1) {
      total += pairCounts.get(pairKey(numbers[leftIndex], numbers[rightIndex])) ?? 0;
    }
  }
  return total;
};

const lexicalLineOrder = (left: CandidateLine, right: CandidateLine): number => {
  for (let index = 0; index < MAIN_SIZE; index += 1) {
    const delta = left.numbers[index] - right.numbers[index];
    if (delta !== 0) return delta;
  }
  return 0;
};

const maximumOverlap = (
  candidate: CandidateLine,
  selected: readonly PortfolioConcentrationLine[],
): number => {
  if (selected.length <= 1) return 0;
  const candidateSet = new Set(candidate.numbers);
  let maximum = 0;
  for (const line of selected.slice(1)) {
    const overlap = line.numbers.reduce(
      (count, number) => count + (candidateSet.has(number) ? 1 : 0),
      0,
    );
    maximum = Math.max(maximum, overlap);
  }
  return maximum;
};

const emptyResult = (
  validSourceRows: number,
  excludedSourceRows: number,
  requestedLines: number,
  coreRetention: 4 | 5,
  reason: string,
): PortfolioConcentrationResult => ({
  available: false,
  reason,
  validSourceRows,
  excludedSourceRows,
  requestedLines,
  coreRetention,
  primaryCore: [],
  alternatePool: [],
  lines: [],
  outputUniqueNumbers: [],
  warnings: excludedSourceRows > 0
    ? [`${excludedSourceRows} malformed source row${excludedSourceRows === 1 ? " was" : "s were"} excluded from concentration.`]
    : [],
  methodology: [],
});

export function buildCoreAndHedgePortfolio(
  rows: readonly PastedCandidateRow[],
  options: PortfolioConcentrationOptions = {},
): PortfolioConcentrationResult {
  const requestedLines = clampInteger(options.lineCount, 6, MIN_LINE_COUNT, MAX_LINE_COUNT);
  const coreRetention = normalizeCoreRetention(options.coreRetention);
  const alternatePoolSize = clampInteger(
    options.alternatePoolSize,
    DEFAULT_ALTERNATE_POOL_SIZE,
    1,
    45 - MAIN_SIZE,
  );
  const validRows = rows.filter(validPortfolioRow);
  const excludedSourceRows = rows.length - validRows.length;
  const numberCounts = new Map<number, number>();
  const pairCounts = new Map<string, number>();

  for (const row of validRows) {
    const numbers = sortedNumbers(row.numbers);
    for (const number of numbers) {
      numberCounts.set(number, (numberCounts.get(number) ?? 0) + 1);
    }
    for (let leftIndex = 0; leftIndex < numbers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < numbers.length; rightIndex += 1) {
        const key = pairKey(numbers[leftIndex], numbers[rightIndex]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  if (validRows.length === 0) {
    return emptyResult(0, excludedSourceRows, requestedLines, coreRetention, "Add at least one valid 6-number or 8-number portfolio row.");
  }
  if (numberCounts.size < MAIN_SIZE) {
    return emptyResult(
      validRows.length,
      excludedSourceRows,
      requestedLines,
      coreRetention,
      "At least six distinct numbers are required to construct a primary line.",
    );
  }

  const rankedNumbers = [...numberCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const primaryCore = sortedNumbers(rankedNumbers.slice(0, MAIN_SIZE).map(([number]) => number));
  const primarySet = new Set(primaryCore);
  const alternatePool = rankedNumbers
    .map(([number]) => number)
    .filter((number) => !primarySet.has(number))
    .slice(0, alternatePoolSize);
  const supportForLine = (numbers: readonly number[]): Pick<CandidateLine, "rowCountSupport" | "pairCooccurrenceSupport"> => ({
    rowCountSupport: numbers.reduce((total, number) => total + (numberCounts.get(number) ?? 0), 0),
    pairCooccurrenceSupport: countPairSupport(numbers, pairCounts),
  });
  const primarySupport = supportForLine(primaryCore);
  const lines: PortfolioConcentrationLine[] = [{
    index: 1,
    role: "primary",
    numbers: primaryCore,
    coreNumbers: primaryCore,
    alternateNumbers: [],
    newlyCoveredAlternates: [],
    ...primarySupport,
  }];
  const warnings: string[] = [];

  if (excludedSourceRows > 0) {
    warnings.push(`${excludedSourceRows} malformed source row${excludedSourceRows === 1 ? " was" : "s were"} excluded from concentration.`);
  }

  const alternateCountPerHedge = MAIN_SIZE - coreRetention;
  if (alternatePool.length < alternateCountPerHedge) {
    warnings.push(
      `Only the primary line could be built because ${alternateCountPerHedge} alternate numbers are required for each hedge.`,
    );
  } else {
    const candidates: CandidateLine[] = [];
    for (const retainedCore of combinations(primaryCore, coreRetention)) {
      for (const alternates of combinations(alternatePool, alternateCountPerHedge)) {
        const numbers = sortedNumbers([...retainedCore, ...alternates]);
        candidates.push({
          numbers,
          coreNumbers: sortedNumbers(retainedCore),
          alternateNumbers: sortedNumbers(alternates),
          ...supportForLine(numbers),
        });
      }
    }

    const selectedKeys = new Set<string>([lineKey(primaryCore)]);
    const coveredAlternates = new Set<number>();

    while (lines.length < requestedLines) {
      const remaining = candidates.filter((candidate) => !selectedKeys.has(lineKey(candidate.numbers)));
      if (remaining.length === 0) break;

      const withNewAlternate = remaining.filter((candidate) => (
        candidate.alternateNumbers.some((number) => !coveredAlternates.has(number))
      ));
      const eligible = withNewAlternate.length > 0 ? withNewAlternate : remaining;
      eligible.sort((left, right) => (
        right.rowCountSupport - left.rowCountSupport
        || right.pairCooccurrenceSupport - left.pairCooccurrenceSupport
        || maximumOverlap(left, lines) - maximumOverlap(right, lines)
        || lexicalLineOrder(left, right)
      ));

      const chosen = eligible[0];
      const newlyCoveredAlternates = chosen.alternateNumbers
        .filter((number) => !coveredAlternates.has(number));
      chosen.alternateNumbers.forEach((number) => coveredAlternates.add(number));
      selectedKeys.add(lineKey(chosen.numbers));
      lines.push({
        index: lines.length + 1,
        role: "hedge",
        ...chosen,
        newlyCoveredAlternates,
      });
    }
  }

  if (lines.length < requestedLines) {
    warnings.push(`Built ${lines.length} of ${requestedLines} requested lines because no further unique hedge combinations were available.`);
  }

  const outputUniqueNumbers = sortedNumbers(Array.from(new Set(lines.flatMap((line) => line.numbers))));

  return {
    available: true,
    reason: null,
    validSourceRows: validRows.length,
    excludedSourceRows,
    requestedLines,
    coreRetention,
    primaryCore,
    alternatePool,
    lines,
    outputUniqueNumbers,
    warnings,
    methodology: [
      "Only valid 6-number and 8-number source rows are used.",
      "The primary line contains the six numbers appearing in the most source rows; numeric order breaks exact ties.",
      `Each hedge retains exactly ${coreRetention} primary numbers and adds ${alternateCountPerHedge} numbers from the top ${alternatePool.length} available alternates.`,
      "Each new hedge must add an uncovered alternate while one remains; eligible lines are then ordered by summed row-count support, summed pair co-occurrence, lower overlap with earlier hedges, and numeric order.",
      "All displayed support values are observed integer counts from the supplied portfolio. They are not probabilities or calibrated predictions.",
    ],
  };
}
