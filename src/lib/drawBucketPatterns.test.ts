import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeDrawBucketPatterns,
  buildDrawMonthOptions,
  DEFAULT_DRAW_BUCKETS,
  formatDrawMonthLabel,
  getDrawMonthKey,
  selectDrawMonthDraws,
  selectComparableMonthDraws,
} from "./drawBucketPatterns";

const history: Draw[] = [
  { date: "2024-01-01", main: [5, 1, 2, 3, 4, 6], supp: [10, 11] },
  { date: "2024-01-08", main: [15, 21, 22, 23, 24, 25], supp: [35, 31] },
  { date: "2024-01-15", main: [7, 8, 9, 12, 13, 14], supp: [20, 40] },
];

describe("analyzeDrawBucketPatterns", () => {
  it("computes per-draw distributions for divisible-by-5 buckets with main+supp", () => {
    const stats = analyzeDrawBucketPatterns(history, { includeSupp: true });
    const div5 = stats.find((bucket) => bucket.key === "div5");

    expect(div5).toBeDefined();
    expect(div5?.totalDraws).toBe(3);
    expect(div5?.averageHits).toBeCloseTo(7 / 3, 5);
    expect(div5?.atLeastOneRate).toBe(100);
    expect(div5?.modeHits).toBe(2);
    expect(div5?.maxObservedHits).toBe(3);
    expect(div5?.distribution.map((bin) => [bin.hits, bin.count])).toEqual([
      [0, 0],
      [1, 0],
      [2, 2],
      [3, 1],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ]);
  });

  it("supports main-only analysis", () => {
    const stats = analyzeDrawBucketPatterns(history, { includeSupp: false });
    const end1 = stats.find((bucket) => bucket.key === "end1");

    expect(end1).toBeDefined();
    expect(end1?.distribution.map((bin) => [bin.hits, bin.count])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);
    expect(end1?.atLeastOneRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(end1?.recentHits).toEqual([1, 1, 0]);
  });

  it("caps recent hits to the requested recent window size", () => {
    const stats = analyzeDrawBucketPatterns(history, { includeSupp: true, recentWindowSize: 2 });
    const div5 = stats.find((bucket) => bucket.key === "div5");

    expect(div5).toBeDefined();
    expect(div5?.recentHits).toEqual([3, 2]);
  });

  it("uses the configured default buckets", () => {
    const stats = analyzeDrawBucketPatterns([], { includeSupp: true });

    expect(stats.map((bucket) => bucket.key)).toEqual(DEFAULT_DRAW_BUCKETS.map((bucket) => bucket.key));
    expect(stats.every((bucket) => bucket.totalDraws === 0)).toBe(true);
    expect(stats.every((bucket) => bucket.distribution.length >= 1)).toBe(true);
  });

  it("builds descending month dropdown options from draw history", () => {
    const monthHistory: Draw[] = [
      { date: "2024-01-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-01-08", main: [1, 9, 10, 11, 12, 13], supp: [2, 14] },
      { date: "2024-02-01", main: [15, 16, 17, 18, 19, 20], supp: [1, 21] },
      { date: "2024-02-08", main: [5, 6, 7, 8, 9, 10], supp: [11, 12] },
      { date: "2024-03-01", main: [13, 14, 15, 16, 17, 18], supp: [19, 20] },
    ];

    expect(getDrawMonthKey("2024-03-01")).toBe("2024-03");
    expect(formatDrawMonthLabel("2024-03")).toContain("2024");

    expect(buildDrawMonthOptions(monthHistory)).toEqual([
      { key: "2024-03", label: formatDrawMonthLabel("2024-03"), drawCount: 1 },
      { key: "2024-02", label: formatDrawMonthLabel("2024-02"), drawCount: 2 },
      { key: "2024-01", label: formatDrawMonthLabel("2024-01"), drawCount: 2 },
    ]);
  });

  it("selects the first N draws from the chosen comparison month", () => {
    const monthHistory: Draw[] = [
      { date: "2024-02-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-02-08", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
      { date: "2024-02-15", main: [17, 18, 19, 20, 21, 22], supp: [23, 24] },
      { date: "2024-03-01", main: [25, 26, 27, 28, 29, 30], supp: [31, 32] },
    ];

    expect(selectComparableMonthDraws(monthHistory, "2024-02", 2).map((draw) => draw.date)).toEqual([
      "2024-02-01",
      "2024-02-08",
    ]);
    expect(selectComparableMonthDraws(monthHistory, "2024-03", 5).map((draw) => draw.date)).toEqual([
      "2024-03-01",
    ]);
    expect(selectComparableMonthDraws(monthHistory, null, 2)).toEqual([]);
  });

  it("selects all draws from a chosen month without truncation", () => {
    const monthHistory: Draw[] = [
      { date: "2024-02-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-02-08", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
      { date: "2024-02-15", main: [17, 18, 19, 20, 21, 22], supp: [23, 24] },
      { date: "2024-03-01", main: [25, 26, 27, 28, 29, 30], supp: [31, 32] },
    ];

    expect(selectDrawMonthDraws(monthHistory, "2024-02").map((draw) => draw.date)).toEqual([
      "2024-02-01",
      "2024-02-08",
      "2024-02-15",
    ]);
    expect(selectDrawMonthDraws(monthHistory, "2024-03").map((draw) => draw.date)).toEqual([
      "2024-03-01",
    ]);
    expect(selectDrawMonthDraws(monthHistory, null)).toEqual([]);
  });
});
