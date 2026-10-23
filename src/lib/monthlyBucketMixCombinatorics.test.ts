import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyBucketMixCombinatorics,
  chooseBigInt,
  formatBigInt,
  getLatestDrawBucketOriginMix,
  sortMonthlyBucketMixRows,
  type MonthlyBucketMixCombinatoricsRow,
} from "./monthlyBucketMixCombinatorics";
import { createEmptyMonthlyBucketSets, type MonthlyBucketSets, type MonthlyFrequencyConstraints } from "./monthlyDrawSummary";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

const bucketSets = (spec: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => {
  const sets = createEmptyMonthlyBucketSets();
  for (const [key, numbers] of Object.entries(spec) as [keyof MonthlyBucketSets, number[]][]) {
    numbers.forEach((number) => sets[key].add(number));
  }
  return sets;
};

describe("analyzeMonthlyBucketMixCombinatorics", () => {
  it("enumerates the full 31/12/2 bucket-mix space for an 8-number draw", () => {
    const sets = bucketSets({
      undrawn: Array.from({ length: 31 }, (_, index) => index + 1),
      times1: Array.from({ length: 12 }, (_, index) => index + 32),
      times2: [44, 45],
    });

    const result = analyzeMonthlyBucketMixCombinatorics(sets);
    const top = [...result.rows].sort((left, right) => (
      left.actualCombinations === right.actualCombinations
        ? 0
        : left.actualCombinations > right.actualCombinations ? -1 : 1
    ))[0];
    const second = [...result.rows].sort((left, right) => (
      left.actualCombinations === right.actualCombinations
        ? 0
        : left.actualCombinations > right.actualCombinations ? -1 : 1
    ))[1];

    expect(result.totalMixes).toBe(24);
    expect(result.totalCombinations).toBe(chooseBigInt(45, 8));
    expect(formatBigInt(result.totalCombinations)).toBe("215,553,195");
    expect(top.counts.undrawn).toBe(6);
    expect(top.counts.times1).toBe(2);
    expect(top.counts.times2).toBe(0);
    expect(top.actualCombinations).toBe(48_594_546n);
    expect(second.counts.undrawn).toBe(5);
    expect(second.counts.times1).toBe(3);
    expect(second.counts.times2).toBe(0);
    expect(second.actualCombinations).toBe(37_380_420n);
  });

  it("labels rows that meet active acceptance needs without filtering them out", () => {
    const sets = bucketSets({
      undrawn: Array.from({ length: 31 }, (_, index) => index + 1),
      times1: Array.from({ length: 12 }, (_, index) => index + 32),
      times2: [44, 45],
    });
    const acceptanceNeeds: MonthlyFrequencyConstraints = {
      undrawn: 6,
      times1: 2,
      times2: 0,
      times3: 0,
      times4: 0,
      times5: 0,
      times6: 0,
      times7: 0,
      times8: 0,
    };

    const result = analyzeMonthlyBucketMixCombinatorics(sets, { acceptanceNeeds });
    const meetingRow = result.rows.find((row) => row.counts.undrawn === 6 && row.counts.times1 === 2 && row.counts.times2 === 0);
    const shortRow = result.rows.find((row) => row.counts.undrawn === 5 && row.counts.times1 === 3 && row.counts.times2 === 0);

    expect(result.acceptanceNeedsActive).toBe(true);
    expect(meetingRow?.meetsAcceptanceNeeds).toBe(true);
    expect(meetingRow?.acceptanceNeedsShortfall).toEqual([]);
    expect(shortRow?.meetsAcceptanceNeeds).toBe(false);
    expect(shortRow?.acceptanceNeedsShortfall).toEqual(["undrawn"]);
  });
});

describe("sortMonthlyBucketMixRows", () => {
  const row = (stageMatches: number, combinations: bigint, undrawn = 6): MonthlyBucketMixCombinatoricsRow => ({
    counts: {
      undrawn, times1: 8 - undrawn, times2: 0, times3: 0, times4: 0,
      times5: 0, times6: 0, times7: 0, times8: 0,
    },
    actualCombinations: combinations,
    shareOfAvailable: 0,
    meetsAcceptanceNeeds: null,
    acceptanceNeedsShortfall: [],
    stageMatchSupportCount: stageMatches,
    stageMatchLabels: [],
  });

  it("sorts Undrawn first, then Stage path, then exact Actual combinations without mutating evidence", () => {
    const mostUndrawn = row(0, 1n, 7);
    const fewerUndrawn = row(20, 999_999n, 5);
    const moreStagePaths = row(3, 1n);
    const lowerCombinations = row(2, 9_007_199_254_740_992n);
    const higherCombinations = row(2, 9_007_199_254_740_993n);
    const fewerStagePaths = row(1, 999_999_999_999_999_999n);
    const rows = [fewerUndrawn, lowerCombinations, fewerStagePaths, mostUndrawn, moreStagePaths, higherCombinations];
    const originalOrder = [...rows];

    expect(sortMonthlyBucketMixRows(rows, "undrawn", "desc"))
      .toEqual([mostUndrawn, moreStagePaths, higherCombinations, lowerCombinations, fewerStagePaths, fewerUndrawn]);
    expect(sortMonthlyBucketMixRows(rows, "undrawn", "asc"))
      .toEqual([fewerUndrawn, moreStagePaths, higherCombinations, lowerCombinations, fewerStagePaths, mostUndrawn]);
    expect(rows).toEqual(originalOrder);
    expect(sortMonthlyBucketMixRows(rows, "undrawn", "desc")[0]).toBe(mostUndrawn);
  });

  it("still sorts Stage path and combinations when every Undrawn count is zero", () => {
    const largerSpace = row(0, 1_000n, 0);
    const supportedSmallSpace = row(2, 1n, 0);
    const supportedLargeSpace = row(2, 100n, 0);
    expect(sortMonthlyBucketMixRows([largerSpace, supportedSmallSpace, supportedLargeSpace], "undrawn", "desc"))
      .toEqual([supportedLargeSpace, supportedSmallSpace, largerSpace]);
  });

  it("resolves equal Undrawn, Stage path and combinations by the remaining bucket counts", () => {
    const moreTimes1 = row(2, 30n, 5);
    const fewerTimes1 = { ...moreTimes1, counts: { ...moreTimes1.counts, times1: 2, times2: 1 } };
    expect(sortMonthlyBucketMixRows([fewerTimes1, moreTimes1], "undrawn", "desc"))
      .toEqual([moreTimes1, fewerTimes1]);
  });

  it("sorts Stage path numerically in both directions, with none counted as zero", () => {
    const rows = [row(2, 20n), row(0, 100n), row(10, 10n), row(1, 50n)];
    expect(sortMonthlyBucketMixRows(rows, "stagePath", "desc").map((item) => item.stageMatchSupportCount))
      .toEqual([10, 2, 1, 0]);
    expect(sortMonthlyBucketMixRows(rows, "stagePath", "asc").map((item) => item.stageMatchSupportCount))
      .toEqual([0, 1, 2, 10]);
    expect(rows.map((item) => item.stageMatchSupportCount)).toEqual([2, 0, 10, 1]);
  });

  it("resolves equal Stage path counts by larger combination count then bucket counts", () => {
    const smaller = row(2, 10n);
    const lowerUndrawn = row(2, 30n, 5);
    const higherUndrawn = row(2, 30n, 7);
    const rows = [smaller, lowerUndrawn, higherUndrawn];
    for (const direction of ["asc", "desc"] as const) {
      expect(sortMonthlyBucketMixRows(rows, "stagePath", direction))
        .toEqual([higherUndrawn, lowerUndrawn, smaller]);
    }
  });

  it("preserves exact Actual combinations sorting without changing row objects", () => {
    const small = row(10, 9_007_199_254_740_992n);
    const large = row(0, 9_007_199_254_740_993n);
    const rows = [small, large];
    const descending = sortMonthlyBucketMixRows(rows, "actualCombinations", "desc");
    expect(descending[0]).toBe(large);
    expect(descending[1]).toBe(small);
    expect(sortMonthlyBucketMixRows(rows, "actualCombinations", "asc")).toEqual([small, large]);
    expect(rows).toEqual([small, large]);
  });
});

describe("getLatestDrawBucketOriginMix", () => {
  it("classifies the latest draw by bucket state before that draw landed", () => {
    const latestOrigin = getLatestDrawBucketOriginMix([
      draw("2026-09-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-09-03", [1, 9, 10, 11, 12, 13], [14, 15]),
    ]);

    expect(latestOrigin?.drawDate).toBe("2026-09-03");
    expect(latestOrigin?.counts.undrawn).toBe(7);
    expect(latestOrigin?.counts.times1).toBe(1);
    expect(latestOrigin?.counts.times2).toBe(0);
    expect(latestOrigin?.warnings).toEqual([]);
  });
});
