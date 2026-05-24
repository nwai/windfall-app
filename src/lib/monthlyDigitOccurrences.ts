import type { Draw } from "../types";

export interface MonthlyDigitNumberCount {
  number: number;
  count: number;
}

export interface MonthlyDigitOccurrenceRow {
  monthLabel: string;
  drawCount: number;
  totalOccurrences: number;
  oneDigitOccurrences: number;
  twoDigitOccurrences: number;
  oneDigitShare: number;
  twoDigitShare: number;
  oneDigitAveragePerDraw: number;
  twoDigitAveragePerDraw: number;
  oneDigitUniqueNumbers: number[];
  twoDigitUniqueNumbers: number[];
  oneDigitTopNumbers: MonthlyDigitNumberCount[];
  twoDigitTopNumbers: MonthlyDigitNumberCount[];
  leadingBucket: "oneDigit" | "twoDigit" | "balanced";
}

export interface MonthlyDigitOccurrenceSummary {
  rows: MonthlyDigitOccurrenceRow[];
  totalMonths: number;
  totalDraws: number;
  totalOccurrences: number;
  totalOneDigitOccurrences: number;
  totalTwoDigitOccurrences: number;
  avgOneDigitPerMonth: number;
  avgTwoDigitPerMonth: number;
  avgOneDigitPerDraw: number;
  avgTwoDigitPerDraw: number;
  monthsOneDigitLed: number;
  monthsTwoDigitLed: number;
  balancedMonths: number;
  strongestOneDigitMonth: MonthlyDigitOccurrenceRow | null;
  strongestTwoDigitMonth: MonthlyDigitOccurrenceRow | null;
  overallOneDigitTopNumbers: MonthlyDigitNumberCount[];
  overallTwoDigitTopNumbers: MonthlyDigitNumberCount[];
  recentBias: MonthlyDigitOccurrenceBias;
}

export interface MonthlyDigitOccurrenceBias {
  recentWindowMonths: number;
  historicalWindowMonths: number;
  recentAvgOneDigitShare: number;
  historicalAvgOneDigitShare: number;
  recentAvgTwoDigitShare: number;
  historicalAvgTwoDigitShare: number;
  oneDigitBiasScore: number;
  twoDigitBiasScore: number;
  direction: "oneDigitHeavy" | "twoDigitHeavy" | "neutral" | "insufficientHistory";
  intensity: "none" | "slight" | "moderate" | "strong";
}

export interface AnalyzeMonthlyDigitOccurrencesOptions {
  includeSupp?: boolean;
}

const ONE_DIGIT_MIN = 1;
const ONE_DIGIT_MAX = 9;
const TWO_DIGIT_MIN = 10;
const TWO_DIGIT_MAX = 45;

const parseDate = (value: string): Date | null => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp);
};

const getMonthKey = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
);

const sortCounts = (counts: Map<number, number>): MonthlyDigitNumberCount[] => (
  Array.from(counts.entries())
    .map(([number, count]) => ({ number, count }))
    .sort((left, right) => right.count - left.count || left.number - right.number)
);

const isOneDigitNumber = (value: number): boolean => value >= ONE_DIGIT_MIN && value <= ONE_DIGIT_MAX;
const isTwoDigitNumber = (value: number): boolean => value >= TWO_DIGIT_MIN && value <= TWO_DIGIT_MAX;

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getRecentWindowMonths = (rowCount: number): number => {
  if (rowCount >= 6) {
    return 3;
  }
  if (rowCount >= 4) {
    return 2;
  }
  if (rowCount >= 2) {
    return 1;
  }
  return 0;
};

const getBiasIntensity = (score: number): MonthlyDigitOccurrenceBias["intensity"] => {
  const magnitude = Math.abs(score);
  if (magnitude >= 12) {
    return "strong";
  }
  if (magnitude >= 6) {
    return "moderate";
  }
  if (magnitude >= 2) {
    return "slight";
  }
  return "none";
};

/**
 * Aggregates draw history by calendar month and compares raw occurrence totals for
 * one-digit numbers (1–9) against two-digit numbers (10–45).
 */
export const analyzeMonthlyDigitOccurrences = (
  history: Draw[],
  options: AnalyzeMonthlyDigitOccurrencesOptions = {},
): MonthlyDigitOccurrenceSummary => {
  const { includeSupp = false } = options;

  const normalized = history
    .map((draw) => {
      const date = parseDate(draw.date || "");
      if (!date) {
        return null;
      }

      const numbers = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
      const validNumbers = numbers.filter((value) => Number.isInteger(value) && value >= ONE_DIGIT_MIN && value <= TWO_DIGIT_MAX);

      return {
        date,
        numbers: validNumbers,
      };
    })
    .filter((entry): entry is { date: Date; numbers: number[] } => entry !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const byMonth = new Map<string, { numbers: number[] }[]>();
  normalized.forEach((entry) => {
    const monthKey = getMonthKey(entry.date);
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey)?.push({ numbers: entry.numbers });
  });

  const overallOneDigitCounts = new Map<number, number>();
  const overallTwoDigitCounts = new Map<number, number>();

  const rows = Array.from(byMonth.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map<MonthlyDigitOccurrenceRow>(([monthLabel, entries]) => {
      const oneDigitCounts = new Map<number, number>();
      const twoDigitCounts = new Map<number, number>();

      entries.forEach((entry) => {
        entry.numbers.forEach((value) => {
          if (isOneDigitNumber(value)) {
            oneDigitCounts.set(value, (oneDigitCounts.get(value) ?? 0) + 1);
            overallOneDigitCounts.set(value, (overallOneDigitCounts.get(value) ?? 0) + 1);
            return;
          }

          if (isTwoDigitNumber(value)) {
            twoDigitCounts.set(value, (twoDigitCounts.get(value) ?? 0) + 1);
            overallTwoDigitCounts.set(value, (overallTwoDigitCounts.get(value) ?? 0) + 1);
          }
        });
      });

      const oneDigitOccurrences = Array.from(oneDigitCounts.values()).reduce((sum, count) => sum + count, 0);
      const twoDigitOccurrences = Array.from(twoDigitCounts.values()).reduce((sum, count) => sum + count, 0);
      const totalOccurrences = oneDigitOccurrences + twoDigitOccurrences;
      const drawCount = entries.length;

      return {
        monthLabel,
        drawCount,
        totalOccurrences,
        oneDigitOccurrences,
        twoDigitOccurrences,
        oneDigitShare: totalOccurrences > 0 ? oneDigitOccurrences / totalOccurrences : 0,
        twoDigitShare: totalOccurrences > 0 ? twoDigitOccurrences / totalOccurrences : 0,
        oneDigitAveragePerDraw: drawCount > 0 ? oneDigitOccurrences / drawCount : 0,
        twoDigitAveragePerDraw: drawCount > 0 ? twoDigitOccurrences / drawCount : 0,
        oneDigitUniqueNumbers: Array.from(oneDigitCounts.keys()).sort((left, right) => left - right),
        twoDigitUniqueNumbers: Array.from(twoDigitCounts.keys()).sort((left, right) => left - right),
        oneDigitTopNumbers: sortCounts(oneDigitCounts),
        twoDigitTopNumbers: sortCounts(twoDigitCounts),
        leadingBucket:
          oneDigitOccurrences === twoDigitOccurrences
            ? "balanced"
            : oneDigitOccurrences > twoDigitOccurrences
              ? "oneDigit"
              : "twoDigit",
      };
    });

  const totalDraws = rows.reduce((sum, row) => sum + row.drawCount, 0);
  const totalOneDigitOccurrences = rows.reduce((sum, row) => sum + row.oneDigitOccurrences, 0);
  const totalTwoDigitOccurrences = rows.reduce((sum, row) => sum + row.twoDigitOccurrences, 0);
  const totalOccurrences = totalOneDigitOccurrences + totalTwoDigitOccurrences;

  const strongestOneDigitMonth = rows.reduce<MonthlyDigitOccurrenceRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    if (row.oneDigitOccurrences > best.oneDigitOccurrences) {
      return row;
    }
    if (row.oneDigitOccurrences === best.oneDigitOccurrences && row.monthLabel > best.monthLabel) {
      return row;
    }
    return best;
  }, null);

  const strongestTwoDigitMonth = rows.reduce<MonthlyDigitOccurrenceRow | null>((best, row) => {
    if (!best) {
      return row;
    }
    if (row.twoDigitOccurrences > best.twoDigitOccurrences) {
      return row;
    }
    if (row.twoDigitOccurrences === best.twoDigitOccurrences && row.monthLabel > best.monthLabel) {
      return row;
    }
    return best;
  }, null);

  const recentWindowMonths = getRecentWindowMonths(rows.length);
  const historicalWindowMonths = Math.max(rows.length - recentWindowMonths, 0);

  const recentRows = recentWindowMonths > 0 ? rows.slice(-recentWindowMonths) : [];
  const historicalRows = historicalWindowMonths > 0 ? rows.slice(0, rows.length - recentWindowMonths) : [];

  const recentAvgOneDigitShare = average(recentRows.map((row) => row.oneDigitShare));
  const historicalAvgOneDigitShare = average(historicalRows.map((row) => row.oneDigitShare));
  const recentAvgTwoDigitShare = average(recentRows.map((row) => row.twoDigitShare));
  const historicalAvgTwoDigitShare = average(historicalRows.map((row) => row.twoDigitShare));
  const oneDigitBiasScore = recentAvgOneDigitShare - historicalAvgOneDigitShare;
  const twoDigitBiasScore = recentAvgTwoDigitShare - historicalAvgTwoDigitShare;

  const recentBias: MonthlyDigitOccurrenceBias = recentRows.length === 0 || historicalRows.length === 0
    ? {
        recentWindowMonths,
        historicalWindowMonths,
        recentAvgOneDigitShare,
        historicalAvgOneDigitShare,
        recentAvgTwoDigitShare,
        historicalAvgTwoDigitShare,
        oneDigitBiasScore: 0,
        twoDigitBiasScore: 0,
        direction: "insufficientHistory",
        intensity: "none",
      }
    : {
        recentWindowMonths,
        historicalWindowMonths,
        recentAvgOneDigitShare,
        historicalAvgOneDigitShare,
        recentAvgTwoDigitShare,
        historicalAvgTwoDigitShare,
        oneDigitBiasScore,
        twoDigitBiasScore,
        direction:
          Math.abs(oneDigitBiasScore) < 0.02
            ? "neutral"
            : oneDigitBiasScore > 0
              ? "oneDigitHeavy"
              : "twoDigitHeavy",
        intensity: getBiasIntensity(oneDigitBiasScore * 100),
      };

  return {
    rows,
    totalMonths: rows.length,
    totalDraws,
    totalOccurrences,
    totalOneDigitOccurrences,
    totalTwoDigitOccurrences,
    avgOneDigitPerMonth: rows.length > 0 ? totalOneDigitOccurrences / rows.length : 0,
    avgTwoDigitPerMonth: rows.length > 0 ? totalTwoDigitOccurrences / rows.length : 0,
    avgOneDigitPerDraw: totalDraws > 0 ? totalOneDigitOccurrences / totalDraws : 0,
    avgTwoDigitPerDraw: totalDraws > 0 ? totalTwoDigitOccurrences / totalDraws : 0,
    monthsOneDigitLed: rows.filter((row) => row.leadingBucket === "oneDigit").length,
    monthsTwoDigitLed: rows.filter((row) => row.leadingBucket === "twoDigit").length,
    balancedMonths: rows.filter((row) => row.leadingBucket === "balanced").length,
    strongestOneDigitMonth,
    strongestTwoDigitMonth,
    overallOneDigitTopNumbers: sortCounts(overallOneDigitCounts),
    overallTwoDigitTopNumbers: sortCounts(overallTwoDigitCounts),
    recentBias,
  };
};