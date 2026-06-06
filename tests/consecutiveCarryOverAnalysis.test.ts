import { describe, expect, it } from "vitest";
import { analyzeConsecutiveCarryOvers } from "../src/lib/consecutiveCarryOverAnalysis";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("analyzeConsecutiveCarryOvers", () => {
  it("returns empty analysis when there are fewer than two months", () => {
    const analysis = analyzeConsecutiveCarryOvers(
      [
        draw("2026-05-01", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("2026-05-08", [9, 10, 11, 12, 13, 14], [15, 16]),
      ],
      { includeSupp: true },
    );

    expect(analysis.events).toEqual([]);
    expect(analysis.distribution.total).toBe(0);
  });

  it("tracks when a number is undrawn for 1 month then drawn", () => {
    const history: Draw[] = [
      // January: numbers 1-30 drawn
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-16", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-01-23", [25, 26, 27, 28, 29, 30], [31, 32]),
      // February: numbers 31-40 drawn (numbers 1-30 remain undrawn = 1 carry-over)
      draw("2026-02-03", [31, 32, 33, 34, 35, 36], [37, 38]),
      draw("2026-02-10", [39, 40, 41, 42, 43, 44], [45, 1]),
    ];

    const analysis = analyzeConsecutiveCarryOvers(history, { includeSupp: true });

    // Numbers 1-30 should each have a 1-carry-over event (undrawn in Jan, drawn in Feb)
    const oneCarryOverEvents = analysis.events.filter((e) => e.consecutiveCarryOvers === 1);
    expect(oneCarryOverEvents.length).toBeGreaterThan(0);
    expect(analysis.distribution.oneCarryOver).toBeGreaterThan(0);
  });

  it("tracks when a number carries over for 2 consecutive months", () => {
    const history: Draw[] = [
      // January: numbers 1-20 drawn, 21-45 undrawn
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-16", [17, 18, 19, 20, 21, 22], [23, 24]),
      // February: numbers 25-35 drawn, keeping 21-45 mostly undrawn (numbers 21-35 carry over 2 times: undrawn Jan, undrawn Feb, drawn Mar)
      draw("2026-02-03", [25, 26, 27, 28, 29, 30], [31, 32]),
      // March: 1-10 and 36-45 drawn (this resolves the carry-over for numbers that were undrawn in Jan and Feb)
      draw("2026-03-05", [36, 37, 38, 39, 40, 41], [42, 43]),
      draw("2026-03-12", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];

    const analysis = analyzeConsecutiveCarryOvers(history, { includeSupp: true });

    // Some numbers should have 2-carry-over events
    expect(analysis.distribution.twoCarryOvers).toBeGreaterThan(0);
  });

  it("correctly identifies carry-over chains of 3 and 4+ months", () => {
    const history: Draw[] = [
      // January: 1-30 drawn
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-16", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-01-23", [25, 26, 27, 28, 29, 30], [31, 32]),
      // February: 35-45 drawn (31-34 carry: 1st carry for 31-34)
      draw("2026-02-03", [35, 36, 37, 38, 39, 40], [41, 42]),
      draw("2026-02-10", [43, 44, 45, 1, 2, 3], [4, 5]),
      // March: 6-32 drawn (31-34 still undrawn: 2nd carry for 31-34)
      draw("2026-03-05", [6, 7, 8, 9, 10, 11], [12, 13]),
      draw("2026-03-12", [14, 15, 16, 17, 18, 19], [20, 21]),
      draw("2026-03-19", [22, 23, 24, 25, 26, 27], [28, 29]),
      draw("2026-03-26", [30, 32, 33, 34, 35, 36], [37, 38]),
      // April: nothing drawn from 31, but some drawn (3rd carry for 31 only)
      draw("2026-04-02", [2, 3, 4, 5, 6, 7], [8, 9]),
      draw("2026-04-09", [10, 11, 12, 13, 14, 15], [16, 17]),
      // May: 31 finally drawn (resolves 3-carry for 31)
      draw("2026-05-03", [31, 40, 41, 42, 43, 44], [45, 1]),
    ];

    const analysis = analyzeConsecutiveCarryOvers(history, { includeSupp: true });

    // Should have at least one 3-carry-over event for number 31
    expect(analysis.events.some((e) => e.consecutiveCarryOvers === 3)).toBe(true);
    expect(analysis.distribution.threeCarryOvers).toBeGreaterThan(0);
    expect(analysis.summary.evidenceOfThreeTimes).toBe(true);
  });

  it("shows majority distribution when most carry-overs stop at 2", () => {
    const history: Draw[] = [
      // January: 1-22 drawn
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-16", [17, 18, 19, 20, 21, 22], [23, 24]),
      // February: 25-43 drawn (23-45 undrawn - 1st carry)
      draw("2026-02-03", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2026-02-10", [33, 34, 35, 36, 37, 38], [39, 40]),
      draw("2026-02-17", [41, 42, 43, 1, 2, 3], [4, 5]),
      // March: 6-44 drawn, leaving 23 (resolves 2-carry for 23-45)
      draw("2026-03-05", [6, 7, 8, 9, 10, 11], [12, 13]),
      draw("2026-03-12", [14, 15, 16, 17, 18, 19], [20, 21]),
      draw("2026-03-19", [22, 24, 25, 26, 27, 28], [29, 30]),
      draw("2026-03-26", [31, 32, 33, 34, 35, 36], [37, 38]),
      draw("2026-03-27", [39, 40, 41, 42, 43, 44], [45, 23]),
      // April: rest of the month
      draw("2026-04-02", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];

    const analysis = analyzeConsecutiveCarryOvers(history, { includeSupp: true });

    // Most should stop at 1 or 2, very few (if any) at 3+
    expect(analysis.distribution.twoCarryOvers).toBeGreaterThan(0);
    expect(analysis.distribution.threeCarryOvers).toBeLessThanOrEqual(
      analysis.distribution.twoCarryOvers,
    );
  });
});
