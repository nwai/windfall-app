import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildMonthlyBucketDrawSeries } from "./monthlyBucketDrawSeries";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildMonthlyBucketDrawSeries", () => {
  it("builds per-draw monthly bucket states in chronological order and resets on a new month", () => {
    const series = buildMonthlyBucketDrawSeries([
      draw("2026-05-08", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-04-10", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-04-03", [1, 2, 3, 4, 5, 6], [7, 8]),
    ]);

    expect(series.drawMonthLabels).toEqual(["2026-04", "2026-04", "2026-05"]);
    expect(series.totalCells).toBe(45 * 3);

    expect(series.bucketIndexSeries[0]).toEqual([1, 2, 1]); // number 1
    expect(series.bucketIndexSeries[1]).toEqual([1, 1, 0]); // number 2 resets in May
    expect(series.bucketIndexSeries[8]).toEqual([0, 1, 1]); // number 9 first appears in 2nd April draw and again in first May draw
  });

  it("includes supp numbers and ignores duplicates within the same draw", () => {
    const series = buildMonthlyBucketDrawSeries([
      draw("5/27/26", [1, 1, 2, 3, 4, 5], [5, 6]),
    ]);

    expect(series.drawMonthLabels).toEqual(["2026-05"]);
    expect(series.bucketIndexSeries[0]).toEqual([1]);
    expect(series.bucketIndexSeries[4]).toEqual([1]);
    expect(series.bucketIndexSeries[5]).toEqual([1]);
    expect(series.bucketIndexSeries[6]).toEqual([0]);
    expect(series.bucketCounts[0]).toBe(39);
    expect(series.bucketCounts[1]).toBe(6);
  });
});
