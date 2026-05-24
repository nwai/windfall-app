import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeMonthlyDigitOccurrences } from "./monthlyDigitOccurrences";

describe("analyzeMonthlyDigitOccurrences", () => {
  const history: Draw[] = [
    { date: "2024-01-03", main: [1, 7, 10, 20, 31, 42], supp: [8, 15] },
    { date: "2024-01-10", main: [2, 9, 11, 22, 33, 44], supp: [3, 40] },
    { date: "2024-02-02", main: [4, 5, 6, 12, 18, 25], supp: [7, 9] },
    { date: "2024-02-09", main: [1, 8, 9, 10, 11, 12], supp: [13, 14] },
    { date: "not-a-date", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
  ];

  it("groups draw history by month and counts main-only one-digit vs two-digit occurrences", () => {
    const summary = analyzeMonthlyDigitOccurrences(history, { includeSupp: false });

    expect(summary.totalMonths).toBe(2);
    expect(summary.totalDraws).toBe(4);
    expect(summary.totalOneDigitOccurrences).toBe(10);
    expect(summary.totalTwoDigitOccurrences).toBe(14);
    expect(summary.avgOneDigitPerDraw).toBe(2.5);
    expect(summary.avgTwoDigitPerDraw).toBe(3.5);
    expect(summary.monthsTwoDigitLed).toBe(1);
    expect(summary.balancedMonths).toBe(1);

    expect(summary.rows[0]).toMatchObject({
      monthLabel: "2024-01",
      drawCount: 2,
      oneDigitOccurrences: 4,
      twoDigitOccurrences: 8,
      oneDigitAveragePerDraw: 2,
      twoDigitAveragePerDraw: 4,
      leadingBucket: "twoDigit",
      oneDigitUniqueNumbers: [1, 2, 7, 9],
      twoDigitUniqueNumbers: [10, 11, 20, 22, 31, 33, 42, 44],
    });

    expect(summary.rows[1]).toMatchObject({
      monthLabel: "2024-02",
      drawCount: 2,
      oneDigitOccurrences: 6,
      twoDigitOccurrences: 6,
      leadingBucket: "balanced",
      oneDigitUniqueNumbers: [1, 4, 5, 6, 8, 9],
      twoDigitUniqueNumbers: [10, 11, 12, 18, 25],
    });

    expect(summary.rows[1].oneDigitTopNumbers.slice(0, 3)).toEqual([
      { number: 1, count: 1 },
      { number: 4, count: 1 },
      { number: 5, count: 1 },
    ]);
    expect(summary.strongestOneDigitMonth?.monthLabel).toBe("2024-02");
    expect(summary.strongestTwoDigitMonth?.monthLabel).toBe("2024-01");
    expect(summary.recentBias.recentWindowMonths).toBe(1);
    expect(summary.recentBias.historicalWindowMonths).toBe(1);
    expect(summary.recentBias.direction).toBe("oneDigitHeavy");
    expect(summary.recentBias.intensity).toBe("strong");
    expect(summary.recentBias.oneDigitBiasScore).toBeCloseTo(1 / 6, 6);
  });

  it("optionally includes supplementary numbers in the monthly totals", () => {
    const summary = analyzeMonthlyDigitOccurrences(history, { includeSupp: true });

    expect(summary.totalOneDigitOccurrences).toBe(14);
    expect(summary.totalTwoDigitOccurrences).toBe(18);
    expect(summary.avgOneDigitPerMonth).toBe(7);
    expect(summary.avgTwoDigitPerMonth).toBe(9);
    expect(summary.monthsTwoDigitLed).toBe(1);
    expect(summary.monthsOneDigitLed).toBe(0);
    expect(summary.balancedMonths).toBe(1);

    expect(summary.rows[0]).toMatchObject({
      monthLabel: "2024-01",
      oneDigitOccurrences: 6,
      twoDigitOccurrences: 10,
      leadingBucket: "twoDigit",
    });

    expect(summary.rows[1]).toMatchObject({
      monthLabel: "2024-02",
      oneDigitOccurrences: 8,
      twoDigitOccurrences: 8,
      leadingBucket: "balanced",
    });

    expect(summary.overallOneDigitTopNumbers[0]).toEqual({ number: 9, count: 3 });
    expect(summary.overallTwoDigitTopNumbers[0]).toEqual({ number: 10, count: 2 });
  });

  it("returns an empty summary when no valid dated rows exist", () => {
    const summary = analyzeMonthlyDigitOccurrences([
      { date: "", main: [1, 2, 3, 10, 11, 12], supp: [4, 5] },
    ]);

    expect(summary.rows).toEqual([]);
    expect(summary.totalMonths).toBe(0);
    expect(summary.totalDraws).toBe(0);
    expect(summary.totalOneDigitOccurrences).toBe(0);
    expect(summary.totalTwoDigitOccurrences).toBe(0);
    expect(summary.strongestOneDigitMonth).toBeNull();
    expect(summary.strongestTwoDigitMonth).toBeNull();
    expect(summary.recentBias.direction).toBe("insufficientHistory");
    expect(summary.recentBias.oneDigitBiasScore).toBe(0);
  });

  it("compares recent months against historical monthly averages to produce a bias score", () => {
    const sixMonthHistory: Draw[] = [
      { date: "2024-01-03", main: [10, 11, 12, 13, 14, 15], supp: [1, 2] },
      { date: "2024-02-07", main: [20, 21, 22, 23, 24, 25], supp: [1, 2] },
      { date: "2024-03-06", main: [30, 31, 32, 33, 34, 35], supp: [1, 2] },
      { date: "2024-04-03", main: [1, 2, 3, 10, 20, 30], supp: [4, 5] },
      { date: "2024-05-01", main: [4, 5, 6, 11, 21, 31], supp: [7, 8] },
      { date: "2024-06-05", main: [7, 8, 9, 12, 22, 32], supp: [1, 2] },
    ];

    const summary = analyzeMonthlyDigitOccurrences(sixMonthHistory, { includeSupp: false });

    expect(summary.totalMonths).toBe(6);
    expect(summary.recentBias.recentWindowMonths).toBe(3);
    expect(summary.recentBias.historicalWindowMonths).toBe(3);
    expect(summary.recentBias.historicalAvgOneDigitShare).toBe(0);
    expect(summary.recentBias.recentAvgOneDigitShare).toBe(0.5);
    expect(summary.recentBias.direction).toBe("oneDigitHeavy");
    expect(summary.recentBias.intensity).toBe("strong");
    expect(summary.recentBias.oneDigitBiasScore).toBe(0.5);
    expect(summary.recentBias.twoDigitBiasScore).toBe(-0.5);
  });
});