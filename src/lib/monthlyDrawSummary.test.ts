import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyDrawSummary,
  computeIdealMonthlyDraw,
  createEmptyMonthlyBucketSets,
  MONTHLY_BUCKET_KEYS,
  projectMonthlyBucketCounts,
} from "./monthlyDrawSummary";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("analyzeMonthlyDrawSummary", () => {
  it("uses only observed draw months while letting ideal-draw logic switch to a synthetic planning month when the calendar has advanced", () => {
    const summary = analyzeMonthlyDrawSummary(
      [
        draw("2024-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("2024-02-07", [9, 10, 11, 12, 13, 14], [15, 16]),
      ],
      { today: new Date("2026-05-26T00:00:00Z") },
    );

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2024-01", "2024-02"]);
    expect(summary.latestRow?.monthLabel).toBe("2024-02");
    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(summary.currentDistribution[0]).toBe(45);
    expect(summary.latestBucketSets.undrawn.size).toBe(37);
    expect([...summary.latestBucketSets.times1]).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(summary.latestBucketSets.undrawn.has(1)).toBe(true);
    expect(summary.latestBucketSets.undrawn.has(9)).toBe(false);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(8);
    expect(summary.quality.syntheticMonthCount).toBe(1);
  });

  it("deduplicates numbers within a draw and reports invalid input instead of overcounting", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-03-01", [1, 1, 2, 46, 2, 3], [3, 4, Number.NaN]),
      draw("invalid-date", [5, 6, 7, 8, 9, 10], [11, 12]),
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].numbers).toEqual([
      { n: 1, c: 1 },
      { n: 2, c: 1 },
      { n: 3, c: 1 },
      { n: 4, c: 1 },
    ]);
    expect(summary.rows[0].frequencyCounts).toEqual([{ times: 1, count: 4 }]);
    expect(summary.rows[0].undrawn).toHaveLength(41);
    expect(summary.quality.invalidDateCount).toBe(1);
    expect(summary.quality.invalidNumberCount).toBe(2);
    expect(summary.quality.duplicateNumberCount).toBe(3);
    expect(summary.quality.warnings).toEqual([
      "1 draw row ignored because its date could not be parsed.",
      "2 invalid number entries ignored.",
      "3 duplicate entries within a draw ignored before monthly counts were calculated.",
    ]);
  });

  it("builds robust monthly targets from medians so one extreme month does not dominate the ideal draw", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-02-07", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-08", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-15", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-22", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-29", [1, 2, 3, 4, 5, 6], [7, 8]),
    ], {
      today: new Date("2024-02-29T12:00:00"),
    });

    expect(summary.bucketTargets.find((bucket) => bucket.times === 0)?.targetCount).toBe(37);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 1)?.targetCount).toBe(8);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 5)?.targetCount).toBe(0);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(4);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 5)?.count).toBe(4);
    expect(summary.idealDraw?.freePicks).toBe(0);
  });

  it("excludes the opening partial month from all-history baseline and ideal-draw calculations", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-05-10", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-05-17", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2024-05-24", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2024-06-05", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2024-07-03", [33, 34, 35, 36, 37, 38], [39, 40]),
    ], {
      today: new Date("2024-07-10T12:00:00Z"),
    });

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2024-05", "2024-06", "2024-07"]);
    expect(summary.effectiveMonthLabel).toBe("2024-07");
    expect(summary.eligibleRows.map((row) => row.monthLabel)).toEqual(["2024-06"]);
    expect(summary.excludedMonthCount).toBe(1);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 0)?.targetCount).toBe(37);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 1)?.targetCount).toBe(8);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(4);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 1)?.count).toBe(4);
  });

  it("keeps the observed current month active while it is still in progress", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2026-04-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-04-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-05-01", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      today: new Date("2026-05-05T12:00:00"),
    });

    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(false);
    expect(summary.effectiveMonthDrawCount).toBe(1);
    expect(summary.currentDistribution[0]).toBe(37);
    expect(summary.currentDistribution[1]).toBe(8);
  });

  it("forwards the ideal-draw planning month when the current month has already reached the observed monthly max", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2026-04-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-04-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-05-01", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-05-08", [25, 26, 27, 28, 29, 30], [31, 32]),
    ], {
      today: new Date("2026-05-30T12:00:00"),
    });

    expect(summary.latestRow?.monthLabel).toBe("2026-05");
    expect(summary.effectiveMonthLabel).toBe("2026-06");
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(summary.currentDistribution[0]).toBe(45);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(8);
  });

  it("parses slash-formatted dates consistently when building monthly buckets", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("4/03/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("4/10/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("5/01/26", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      today: new Date("2026-05-05T12:00:00"),
    });

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2026-04", "2026-05"]);
    expect(summary.latestRow?.monthLabel).toBe("2026-05");
    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(false);
  });

  it("returns all monthly bucket keys with disjoint sets covering numbers one through forty-five", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-04-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-04-08", [1, 2, 9, 10, 11, 12], [13, 14]),
    ]);

    const seen = new Set<number>();
    for (const key of MONTHLY_BUCKET_KEYS) {
      for (const n of summary.latestBucketSets[key]) {
        expect(seen.has(n)).toBe(false);
        seen.add(n);
      }
    }
    expect(seen.size).toBe(45);
    expect([...summary.latestBucketSets.times2]).toEqual([1, 2]);
    expect([...summary.latestBucketSets.times1]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});

describe("computeIdealMonthlyDraw", () => {
  it("exhaustively selects the bucket allocation that best moves the current distribution toward target", () => {
    const result = computeIdealMonthlyDraw({
      currentDistribution: [37, 8, 0, 0, 0, 0, 0, 0, 0],
      targetDistribution: [37, 0, 8, 0, 0, 0, 0, 0, 0],
      drawSize: 8,
    });

    expect(result.bucketCounts).toEqual([
      { times: 0, count: 0 },
      { times: 1, count: 8 },
      { times: 2, count: 0 },
      { times: 3, count: 0 },
      { times: 4, count: 0 },
      { times: 5, count: 0 },
      { times: 6, count: 0 },
      { times: 7, count: 0 },
      { times: 8, count: 0 },
    ]);
    expect(result.freePicks).toBe(0);
    expect(result.scoreAfter).toBe(0);
  });
});

describe("projectMonthlyBucketCounts", () => {
  it("shows running what-if bucket totals as clicked numbers move into the next bucket", () => {
    const bucketSets = createEmptyMonthlyBucketSets();
    [1, 2, 3].forEach((n) => bucketSets.undrawn.add(n));
    [4, 5].forEach((n) => bucketSets.times2.add(n));
    [6, 7, 8, 9].forEach((n) => bucketSets.times3.add(n));
    [10, 11].forEach((n) => bucketSets.times8.add(n));

    const projection = projectMonthlyBucketCounts(bucketSets, {
      undrawn: [1, 1, 99],
      times1: [],
      times2: [4],
      times3: [6, 7],
      times4: [],
      times5: [],
      times6: [],
      times7: [],
      times8: [10],
    });

    expect(projection.undrawn).toEqual({
      baseCount: 3,
      projectedCount: 2,
      delta: -1,
      selectedCount: 1,
    });
    expect(projection.times1).toEqual({
      baseCount: 0,
      projectedCount: 1,
      delta: 1,
      selectedCount: 0,
    });
    expect(projection.times2).toEqual({
      baseCount: 2,
      projectedCount: 1,
      delta: -1,
      selectedCount: 1,
    });
    expect(projection.times3).toEqual({
      baseCount: 4,
      projectedCount: 3,
      delta: -1,
      selectedCount: 2,
    });
    expect(projection.times4).toEqual({
      baseCount: 0,
      projectedCount: 2,
      delta: 2,
      selectedCount: 0,
    });
    expect(projection.times8).toEqual({
      baseCount: 2,
      projectedCount: 2,
      delta: 0,
      selectedCount: 1,
    });
  });
});
