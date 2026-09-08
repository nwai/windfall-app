import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyBucketMixReplay,
  bucketMixReplayRowSummary,
} from "./monthlyBucketMixReplay";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("analyzeMonthlyBucketMixReplay", () => {
  it("replays actual bucket-origin mixes without looking at the target draw first", () => {
    const result = analyzeMonthlyBucketMixReplay([
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-06-05", [2, 3, 4, 5, 6, 7], [8, 9]),
    ], {
      scope: "same-month-length",
      targetMonthDrawCount: 3,
      targetMonthLabel: "2026-07",
    });

    expect(result.baselineMonthCount).toBe(1);
    expect(result.trialCount).toBe(3);

    const d1 = result.rows.find((row) => row.drawOrdinal === 1);
    const d2 = result.rows.find((row) => row.drawOrdinal === 2);
    const d3 = result.rows.find((row) => row.drawOrdinal === 3);

    expect(d1?.fixedStructural).toBe(true);
    expect(d1?.top1HitRate).toBe(1);
    expect(d1?.mostCommonMix.undrawn).toBe(8);

    expect(d2?.mostCommonMix.undrawn).toBe(7);
    expect(d2?.mostCommonMix.times1).toBe(1);

    expect(d3?.mostCommonMix.undrawn).toBe(0);
    expect(d3?.mostCommonMix.times1).toBe(8);
    expect(d3?.mostCommonMix.times2).toBe(0);
  });

  it("excludes the target month from baseline rows while still marking the latest trial", () => {
    const result = analyzeMonthlyBucketMixReplay([
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-07-03", [1, 9, 10, 11, 12, 13], [14, 15]),
    ], {
      scope: "same-month-length",
      targetMonthDrawCount: 2,
      targetMonthLabel: "2026-07",
    });

    expect(result.baselineMonthCount).toBe(0);
    expect(result.trialCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.latestTrial?.monthLabel).toBe("2026-07");
    expect(result.latestTrial?.drawOrdinal).toBe(2);
    expect(result.latestTrial?.monthDrawCount).toBe(2);
    expect(result.latestTrial?.actualCounts.undrawn).toBe(7);
    expect(result.latestTrial?.actualCounts.times1).toBe(1);
  });

  it("can pool all baseline month lengths by draw ordinal", () => {
    const result = analyzeMonthlyBucketMixReplay([
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-07-01", [16, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-07-03", [16, 24, 25, 26, 27, 28], [29, 30]),
      draw("2026-07-05", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      scope: "all-month-lengths",
      targetMonthLabel: "2026-08",
    });

    const d2 = result.rows.find((row) => row.drawOrdinal === 2);

    expect(result.baselineMonthCount).toBe(2);
    expect(d2?.monthLengthLabel).toBe("All");
    expect(d2?.trials).toBe(2);
    expect(bucketMixReplayRowSummary(d2!)).toContain("D2");
  });

  it("falls back to pooled month lengths when same-length replay has no target length", () => {
    const result = analyzeMonthlyBucketMixReplay([
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-07-01", [16, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-07-03", [16, 24, 25, 26, 27, 28], [29, 30]),
      draw("2026-07-05", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      scope: "same-month-length",
      targetMonthLabel: "2026-08",
    });

    expect(result.scope).toBe("all-month-lengths");
    expect(result.warnings.join(" ")).toContain("no resolved target month length");
    expect(result.rows.every((row) => row.monthLengthLabel === "All")).toBe(true);
  });
});
