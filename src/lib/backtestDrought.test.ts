import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { backtestDroughtPredictions, backtestStrictDroughtShortlist } from "./backtestDrought";
import { computeDroughtHazard, computeStrictDroughtShortlist } from "./droughtHazard";

const draw = (main: number[], supp: number[], date: string): Draw => ({ main, supp, date });

const expectedHazardTop = (history: Draw[], topK: number): number[] => (
  computeDroughtHazard(history)
    .byNumber
    .slice()
    .sort((left, right) => right.p - left.p || right.k - left.k || left.number - right.number)
    .slice(0, topK)
    .map((row) => row.number)
);

describe("backtestDroughtPredictions", () => {
  it("walks forward with the same empirical drought hazard ranking used by the DGA panel", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-03"),
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-05"),
      draw([17, 18, 19, 20, 21, 22], [23, 24], "2026-01-07"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-10"),
    ];

    const summary = backtestDroughtPredictions(history, {
      minHistory: 3,
      useRollingWindow: false,
      topK: 6,
    });

    expect(summary.records).toHaveLength(2);
    expect(summary.records[0].topK).toEqual(expectedHazardTop(history.slice(0, 3), 6));
    expect(summary.records[1].topK).toEqual(expectedHazardTop(history.slice(0, 4), 6));
    expect(summary.baseline.topKAnyHitProbability).toBeGreaterThan(0);
    expect(summary.baseline.expectedHitsInTopK).toBeCloseTo(6 * 8 / 45, 10);
  });
});

describe("backtestStrictDroughtShortlist", () => {
  it("rebuilds strict drought rows from prior draws only before scoring the target draw", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-03"),
      draw([17, 18, 19, 20, 21, 22], [23, 24], "2026-01-05"),
      draw([25, 26, 27, 28, 29, 30], [31, 32], "2026-01-07"),
      draw([1, 33, 34, 35, 36, 37], [38, 39], "2026-01-10"),
      draw([9, 17, 25, 33, 40, 41], [42, 43], "2026-01-12"),
      draw([2, 10, 18, 26, 34, 42], [3, 11], "2026-02-02"),
    ];

    const result = backtestStrictDroughtShortlist(history, {
      minHistory: 4,
      topK: 8,
      threshold: 2,
      randomTrials: 20,
      bootstrapIterations: 20,
      seed: 99,
    });

    const expectedBeforeTarget = computeStrictDroughtShortlist(history.slice(0, 4), history.slice(0, 4), { threshold: 2 })
      .rows
      .slice(0, 8)
      .map((row) => row.number);
    const leakedAfterTarget = computeStrictDroughtShortlist(history.slice(0, 5), history.slice(0, 5), { threshold: 2 })
      .rows
      .slice(0, 8)
      .map((row) => row.number);

    expect(result.records).toHaveLength(3);
    expect(result.records[0].targetDate).toBe("2026-01-10");
    expect(result.records[0].shortlist).toEqual(expectedBeforeTarget);
    expect(result.records[0].shortlist).not.toEqual(leakedAfterTarget);
    expect(result.records[0].targetDrawOrdinal).toBe(5);
    expect(result.records[0].targetMonthDrawCount).toBe(6);
    expect(result.records[0].remainingDrawsInMonth).toBe(1);
    expect(result.records[0].actualOriginBucketCounts).toEqual(expect.objectContaining({
      Undrawn: 7,
      "1x": 1,
    }));
    expect(result.records[0].hits.map((hit) => hit.num)).toEqual([1]);
    expect(result.records[0].inObservedBand).toBe(true);
  });

  it("reports equal-size random shortlist benchmarks without changing the strict records", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-03"),
      draw([17, 18, 19, 20, 21, 22], [23, 24], "2026-01-05"),
      draw([25, 26, 27, 28, 29, 30], [31, 32], "2026-01-07"),
      draw([1, 33, 34, 35, 36, 37], [38, 39], "2026-01-10"),
      draw([9, 17, 25, 33, 40, 41], [42, 43], "2026-01-12"),
      draw([2, 10, 18, 26, 34, 42], [3, 11], "2026-02-02"),
    ];

    const result = backtestStrictDroughtShortlist(history, {
      minHistory: 4,
      topK: 8,
      threshold: 2,
      randomTrials: 50,
      bootstrapIterations: 50,
      focusStartDrawNumber: 6,
      seed: 7,
    });

    expect(result.scope).toBe("mains+supps");
    expect(result.all.averageShortlistSize).toBeGreaterThan(0);
    expect(result.all.expectedRandomAverageHits).toBeGreaterThan(0);
    expect(result.all.expectedRandomOneToThreeHitRate).toBeGreaterThan(0);
    expect(result.all.randomBenchmarkOneToThreePValue).not.toBeNull();
    expect(result.all.bootstrapOneToThreeCi).not.toBeNull();
    expect(result.focus?.trials).toBe(2);
    expect(result.bucketProfiles.map((row) => row.label)).toEqual([
      "All replay rows",
      "Zero-hit rows",
      "Positive-hit rows",
    ]);
    expect(result.byMonthStage.some((row) => row.monthDrawCount === 6 && row.ordinal === 5)).toBe(true);
  });
});
