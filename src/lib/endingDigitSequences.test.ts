import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeEndingDigitSequences } from "./endingDigitSequences";

describe("analyzeEndingDigitSequences", () => {
  const history: Draw[] = [
    { date: "2024-01-01", main: [12, 23, 34, 45, 8, 19], supp: [20, 7] },
    { date: "2024-01-08", main: [16, 27, 38, 49, 10, 21], supp: [32, 43] },
    { date: "2024-01-15", main: [1, 12, 24, 35, 46, 8], supp: [19, 30] },
  ];

  it("finds circular ending-digit runs for main+supp draws", () => {
    const summary = analyzeEndingDigitSequences(history, { includeSupp: true });

    expect(summary.totalDraws).toBe(3);
    expect(summary.drawsWithMaxRunAtLeast3).toBe(3);
    expect(summary.drawsWithMaxRunAtLeast4).toBe(3);
    expect(summary.drawsWithCoveredNumbersAtLeast4).toBe(3);
    expect(summary.maxRunLengthFrequency).toEqual({ 4: 1, 5: 1, 8: 1 });
    expect(summary.coveredNumbersFrequency).toEqual({ 4: 1, 5: 1, 8: 1 });

    expect(summary.perDraw[0].maxRuns.map((run) => run.digits)).toEqual([[2, 3, 4, 5], [7, 8, 9, 0]]);
    expect(summary.perDraw[0].coveredNumbers).toBe(4);
  });

  it("supports main-only analysis", () => {
    const summary = analyzeEndingDigitSequences(history, { includeSupp: false });

    expect(summary.totalDraws).toBe(3);
    expect(summary.perDraw[0].numbers).toEqual([12, 23, 34, 45, 8, 19]);
    expect(summary.perDraw[0].maxRunLength).toBe(4);
    expect(summary.perDraw[0].coveredNumbers).toBe(4);
    expect(summary.maxRunLengthFrequency).toEqual({ 3: 1, 4: 1, 6: 1 });
    expect(summary.coveredNumbersFrequency).toEqual({ 3: 1, 4: 1, 6: 1 });
  });

  it("handles empty draw history", () => {
    const summary = analyzeEndingDigitSequences([]);

    expect(summary.totalDraws).toBe(0);
    expect(summary.drawsWithMaxRunAtLeast3).toBe(0);
    expect(summary.maxRunLengthFrequency).toEqual({});
    expect(summary.coveredNumbersFrequency).toEqual({});
    expect(summary.perDraw).toEqual([]);
  });
});
