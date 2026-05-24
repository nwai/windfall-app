import type { Draw } from "../types";

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

const countFrequency = (values: number[]): Record<number, number> => {
  const freq = new Map<number, number>();
  values.forEach((value) => {
    freq.set(value, (freq.get(value) ?? 0) + 1);
  });
  return Object.fromEntries([...freq.entries()].sort((a, b) => a[0] - b[0]));
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
    const numbers = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
    const endings = numbers.map((number) => ((number % 10) + 10) % 10);
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
