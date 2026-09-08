import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyBucketMixCombinatorics,
  chooseBigInt,
  formatBigInt,
  getLatestDrawBucketOriginMix,
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
