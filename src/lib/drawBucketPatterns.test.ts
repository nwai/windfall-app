import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeDrawBucketPatterns,
  buildDrawBucketPatternLeaderboard,
  buildDrawMonthOptions,
  DEFAULT_DRAW_BUCKETS,
  formatDrawMonthLabel,
  getDrawMonthKey,
  selectDrawMonthDraws,
  selectComparableMonthDraws,
  sortDrawBucketPatternStats,
  type DrawBucketPatternStats,
} from "./drawBucketPatterns";

const history: Draw[] = [
  { date: "2024-01-01", main: [5, 1, 2, 3, 4, 6], supp: [10, 11] },
  { date: "2024-01-08", main: [15, 21, 22, 23, 24, 25], supp: [35, 31] },
  { date: "2024-01-15", main: [7, 8, 9, 12, 13, 14], supp: [20, 40] },
];

const leaderboardFixture = (overrides: Partial<DrawBucketPatternStats> & Pick<DrawBucketPatternStats, "key" | "label">): DrawBucketPatternStats => ({
  key: overrides.key,
  label: overrides.label,
  numbers: overrides.numbers ?? [],
  description: overrides.description ?? "",
  totalDraws: overrides.totalDraws ?? 12,
  averageHits: overrides.averageHits ?? 0,
  atLeastOneRate: overrides.atLeastOneRate ?? 0,
  zeroRate: overrides.zeroRate ?? 0,
  modeHits: overrides.modeHits ?? 0,
  maxObservedHits: overrides.maxObservedHits ?? 0,
  maxPossibleHits: overrides.maxPossibleHits ?? 3,
  totalHits: overrides.totalHits ?? 0,
  distribution: overrides.distribution ?? [],
  recentHits: overrides.recentHits ?? [],
});

describe("analyzeDrawBucketPatterns", () => {
  it("splits formerly combined divisible-by-5 numbers into ending-0 and ending-5 buckets", () => {
    const stats = analyzeDrawBucketPatterns(history, { includeSupp: true });
    const end0 = stats.find((bucket) => bucket.key === "end0");
    const end5 = stats.find((bucket) => bucket.key === "end5");

    expect(stats.find((bucket) => bucket.key === "div5")).toBeUndefined();
    expect(end0?.numbers).toEqual([10, 20, 30, 40]);
    expect(end5?.numbers).toEqual([5, 15, 25, 35, 45]);

    expect(end0?.totalDraws).toBe(3);
    expect(end0?.averageHits).toBeCloseTo(1, 5);
    expect(end0?.atLeastOneRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(end0?.modeHits).toBe(0);
    expect(end0?.maxObservedHits).toBe(2);
    expect(end0?.distribution.map((bin) => [bin.hits, bin.count])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 0],
      [4, 0],
    ]);

    expect(end5?.totalDraws).toBe(3);
    expect(end5?.averageHits).toBeCloseTo(4 / 3, 5);
    expect(end5?.atLeastOneRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(end5?.modeHits).toBe(0);
    expect(end5?.maxObservedHits).toBe(3);
    expect(end5?.distribution.map((bin) => [bin.hits, bin.count])).toEqual([
      [0, 1],
      [1, 1],
      [2, 0],
      [3, 1],
      [4, 0],
      [5, 0],
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
    const end0 = stats.find((bucket) => bucket.key === "end0");
    const end5 = stats.find((bucket) => bucket.key === "end5");

    expect(end0?.recentHits).toEqual([0, 2]);
    expect(end5?.recentHits).toEqual([3, 0]);
  });

  it("uses the configured default buckets", () => {
    const stats = analyzeDrawBucketPatterns([], { includeSupp: true });

    expect(stats.map((bucket) => bucket.key)).toEqual(DEFAULT_DRAW_BUCKETS.map((bucket) => bucket.key));
    expect(stats.map((bucket) => bucket.key)).toEqual([
      "end0",
      "end1",
      "end2",
      "end3",
      "end4",
      "end5",
      "end6",
      "end7",
      "end8",
      "end9",
    ]);
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

  it("sorts bucket stats consistently for each supported sort mode", () => {
    const stats: DrawBucketPatternStats[] = [
      leaderboardFixture({ key: "alpha", label: "Alpha", averageHits: 1.1, atLeastOneRate: 70, zeroRate: 30, modeHits: 1, maxObservedHits: 2, totalHits: 22, recentHits: [1, 1, 1] }),
      leaderboardFixture({ key: "beta", label: "Beta", averageHits: 1.4, atLeastOneRate: 60, zeroRate: 40, modeHits: 2, maxObservedHits: 3, totalHits: 28, recentHits: [2, 2, 1] }),
      leaderboardFixture({ key: "gamma", label: "Gamma", averageHits: 0.9, atLeastOneRate: 90, zeroRate: 10, modeHits: 1, maxObservedHits: 1, totalHits: 18, recentHits: [0, 1, 0] }),
    ];

    expect(sortDrawBucketPatternStats(stats, "atLeastOne").map((stat) => stat.key)).toEqual(["gamma", "alpha", "beta"]);
    expect(sortDrawBucketPatternStats(stats, "averageHits").map((stat) => stat.key)).toEqual(["beta", "alpha", "gamma"]);
    expect(sortDrawBucketPatternStats(stats, "modeHits").map((stat) => stat.key)).toEqual(["beta", "gamma", "alpha"]);
    expect(sortDrawBucketPatternStats(stats, "label").map((stat) => stat.key)).toEqual(["alpha", "beta", "gamma"]);
    expect(sortDrawBucketPatternStats(stats, "overall").map((stat) => stat.key)).toEqual(["beta", "alpha", "gamma"]);
  });

  it("builds leaderboard rows with explicit per-metric positions", () => {
    const stats: DrawBucketPatternStats[] = [
      leaderboardFixture({ key: "alpha", label: "Alpha", averageHits: 1.1, atLeastOneRate: 70, zeroRate: 30, modeHits: 1, maxObservedHits: 2, totalHits: 22, recentHits: [1, 1, 1] }),
      leaderboardFixture({ key: "beta", label: "Beta", averageHits: 1.4, atLeastOneRate: 60, zeroRate: 40, modeHits: 2, maxObservedHits: 3, totalHits: 28, recentHits: [2, 2, 1] }),
      leaderboardFixture({ key: "gamma", label: "Gamma", averageHits: 0.9, atLeastOneRate: 90, zeroRate: 10, modeHits: 1, maxObservedHits: 1, totalHits: 18, recentHits: [0, 1, 0] }),
    ];

    const leaderboard = buildDrawBucketPatternLeaderboard(stats, "averageHits");

    expect(leaderboard.map((row) => [row.selectedSortPosition, row.stat.key])).toEqual([
      [1, "beta"],
      [2, "alpha"],
      [3, "gamma"],
    ]);

    expect(leaderboard[0]).toMatchObject({
      stat: { key: "beta" },
      selectedSortPosition: 1,
      overallPosition: 1,
      atLeastOnePosition: 3,
      averageHitsPosition: 1,
      modeHitsPosition: 1,
      zeroRatePosition: 3,
      maxObservedHitsPosition: 1,
      totalHitsPosition: 1,
      recentAveragePosition: 1,
    });
    expect(leaderboard[0].overallScore).toBeCloseTo(500 / 7, 5);
    expect(leaderboard[0].recentAverageHits).toBeCloseTo(5 / 3, 5);

    expect(leaderboard[2]).toMatchObject({
      stat: { key: "gamma" },
      selectedSortPosition: 3,
      overallPosition: 3,
      atLeastOnePosition: 1,
      averageHitsPosition: 3,
      modeHitsPosition: 2,
      zeroRatePosition: 1,
      maxObservedHitsPosition: 3,
      totalHitsPosition: 3,
      recentAveragePosition: 3,
    });
    expect(leaderboard[2].overallScore).toBeCloseTo(250 / 7, 5);
    expect(leaderboard[2].recentAverageHits).toBeCloseTo(1 / 3, 5);
  });

  it("orders leaderboard rows by equal-weight overall metric support", () => {
    const stats: DrawBucketPatternStats[] = [
      leaderboardFixture({ key: "alpha", label: "Alpha", averageHits: 1.1, atLeastOneRate: 70, zeroRate: 30, modeHits: 1, maxObservedHits: 2, totalHits: 22, recentHits: [1, 1, 1] }),
      leaderboardFixture({ key: "beta", label: "Beta", averageHits: 1.4, atLeastOneRate: 60, zeroRate: 40, modeHits: 2, maxObservedHits: 3, totalHits: 28, recentHits: [2, 2, 1] }),
      leaderboardFixture({ key: "gamma", label: "Gamma", averageHits: 0.9, atLeastOneRate: 90, zeroRate: 10, modeHits: 1, maxObservedHits: 1, totalHits: 18, recentHits: [0, 1, 0] }),
    ];

    const leaderboard = buildDrawBucketPatternLeaderboard(stats, "overall");

    expect(leaderboard.map((row) => [row.overallPosition, row.stat.key])).toEqual([
      [1, "beta"],
      [2, "alpha"],
      [3, "gamma"],
    ]);
    expect(leaderboard.map((row) => row.selectedSortPosition)).toEqual([1, 2, 3]);
  });
});
