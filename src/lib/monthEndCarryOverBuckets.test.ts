import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeMonthEndCarryOverBuckets } from "./monthEndCarryOverBuckets";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("analyzeMonthEndCarryOverBuckets", () => {
  it("groups month-end last-to-first carry-over numbers by their source-month frequency bucket", () => {
    const history: Draw[] = [
      draw("2026-01-01", [2, 6, 10, 11, 12, 13]),
      draw("2026-01-08", [2, 6, 14, 15, 16, 17]),
      draw("2026-01-15", [6, 18, 19, 20, 21, 22]),
      draw("2026-01-22", [6, 23, 24, 25, 26, 27]),
      draw("2026-01-29", [1, 2, 6, 28, 29, 30]),
      draw("2026-02-02", [1, 2, 6, 31, 32, 33]),
      draw("2026-02-09", [34, 35, 36, 37, 38, 39]),
    ];

    const analysis = analyzeMonthEndCarryOverBuckets(history, {
      includeSupp: false,
      excludePartialSourceMonths: false,
    });

    expect(analysis.summary.transitions).toBe(1);
    expect(analysis.summary.totalCarryOverInstances).toBe(3);
    expect(analysis.summary.leadingBucket).toBe("1x");
    expect(analysis.summary.leadingBuckets).toEqual(["1x", "3x", "5x"]);
    expect(analysis.bucketRows.find((row) => row.bucket === "1x")?.sourceObservations).toBe(22);
    expect(analysis.bucketRows.find((row) => row.bucket === "1x")?.lastDrawObservations).toBe(4);
    expect(analysis.bucketRows.find((row) => row.bucket === "1x")?.carryOverRate).toBeCloseTo(1 / 4, 8);
    expect(analysis.bucketRows.find((row) => row.bucket === "1x")?.carryOverNumbers.map((item) => item.number)).toEqual([1]);
    expect(analysis.bucketRows.find((row) => row.bucket === "3x")?.lastDrawObservations).toBe(1);
    expect(analysis.bucketRows.find((row) => row.bucket === "3x")?.carryOverNumbers.map((item) => item.number)).toEqual([2]);
    expect(analysis.bucketRows.find((row) => row.bucket === "5x")?.lastDrawObservations).toBe(1);
    expect(analysis.bucketRows.find((row) => row.bucket === "5x")?.carryOverNumbers.map((item) => item.number)).toEqual([6]);
  });

  it("reports high-frequency carry-over rarity separately from lower bucket counts", () => {
    const history: Draw[] = [
      draw("2026-01-01", [2, 6, 10, 11, 12, 13]),
      draw("2026-01-08", [2, 6, 14, 15, 16, 17]),
      draw("2026-01-15", [6, 18, 19, 20, 21, 22]),
      draw("2026-01-22", [6, 23, 24, 25, 26, 27]),
      draw("2026-01-29", [1, 2, 6, 28, 29, 30]),
      draw("2026-02-02", [1, 2, 6, 31, 32, 33]),
    ];

    const analysis = analyzeMonthEndCarryOverBuckets(history, {
      includeSupp: false,
      excludePartialSourceMonths: false,
    });

    expect(analysis.summary.highBucketCarryOverInstances).toBe(0);
    expect(analysis.bucketRows.find((row) => row.bucket === "5x")?.carryOverInstances).toBe(1);
    expect(analysis.bucketRows.find((row) => row.bucket === "6x")?.carryOverInstances).toBe(0);
  });
});
