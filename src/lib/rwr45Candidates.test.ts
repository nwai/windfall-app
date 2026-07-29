import { describe, expect, it } from "vitest";

import { generateRwR45Candidates } from "./rwr45Candidates";
import type { MonthlyBucketSets, MonthlyFrequencyConstraints } from "./monthlyDrawSummary";

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const bucketSets = (entries: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => ({
  undrawn: new Set(entries.undrawn ?? []),
  times1: new Set(entries.times1 ?? []),
  times2: new Set(entries.times2 ?? []),
  times3: new Set(entries.times3 ?? []),
  times4: new Set(entries.times4 ?? []),
  times5: new Set(entries.times5 ?? []),
  times6: new Set(entries.times6 ?? []),
  times7: new Set(entries.times7 ?? []),
  times8: new Set(entries.times8 ?? []),
});

const constraints = (partial: Partial<MonthlyFrequencyConstraints>): MonthlyFrequencyConstraints => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
  ...partial,
});

const countFromSet = (numbers: number[], set: Set<number>): number => (
  numbers.filter((number) => set.has(number)).length
);

describe("generateRwR45Candidates", () => {
  it("creates exactly seven full candidates with globally unique mains", () => {
    const result = generateRwR45Candidates(seededRandom(20260710));

    expect(result.candidates).toHaveLength(7);
    for (const candidate of result.candidates) {
      expect(candidate.main).toHaveLength(6);
      expect(candidate.supp).toHaveLength(2);
      expect([...candidate.main, ...candidate.supp].every((n) => n >= 1 && n <= 45)).toBe(true);
      expect(new Set([...candidate.main, ...candidate.supp]).size).toBe(8);
      expect(candidate.main).toEqual([...candidate.main].sort((a, b) => a - b));
      expect(candidate.supp).toEqual([...candidate.supp].sort((a, b) => a - b));
    }

    const allMains = result.candidates.flatMap((candidate) => candidate.main);
    expect(allMains).toHaveLength(42);
    expect(new Set(allMains).size).toBe(42);
  });

  it("uses the three numbers left after main partitioning as the only supplementary pool", () => {
    const result = generateRwR45Candidates(seededRandom(12345));
    const mainSet = new Set(result.candidates.flatMap((candidate) => candidate.main));
    const expectedSuppPool = Array.from({ length: 45 }, (_, index) => index + 1)
      .filter((number) => !mainSet.has(number));
    const actualSuppPool = Array.from(
      new Set(result.candidates.flatMap((candidate) => candidate.supp)),
    ).sort((a, b) => a - b);

    expect(result.supplementaryPool).toEqual(expectedSuppPool);
    expect(expectedSuppPool).toHaveLength(3);
    expect(actualSuppPool.every((number) => expectedSuppPool.includes(number))).toBe(true);
    for (const candidate of result.candidates) {
      expect(candidate.supp.every((number) => expectedSuppPool.includes(number))).toBe(true);
    }
  });

  it("records an honest trace explaining the random coverage mode", () => {
    const result = generateRwR45Candidates(seededRandom(7));

    expect(result.traceLines.join("\n")).toContain("PNUaRW45");
    expect(result.traceLines.join("\n")).toContain("Count ignored");
    expect(result.traceLines.join("\n")).toContain("42 globally unique mains");
    expect(result.traceLines.join("\n")).toContain("3-number supplementary pool");
  });

  it("honors forced inclusions and exclusions while keeping non-forced main coverage unique", () => {
    const forcedNumbers = [4, 7, 22];
    const excludedNumbers = [1, 2, 3, 44, 45];
    const result = generateRwR45Candidates(seededRandom(20260711), {
      forcedNumbers,
      excludedNumbers,
    });
    const forcedSet = new Set(forcedNumbers);
    const excludedSet = new Set(excludedNumbers);

    expect(result.candidates).toHaveLength(7);
    for (const candidate of result.candidates) {
      const nums = [...candidate.main, ...candidate.supp];
      expect(candidate.main).toHaveLength(6);
      expect(candidate.supp).toHaveLength(2);
      expect(new Set(nums).size).toBe(8);
      expect(forcedNumbers.every((number) => nums.includes(number))).toBe(true);
      expect(nums.some((number) => excludedSet.has(number))).toBe(false);
    }

    const nonForcedMains = result.candidates
      .flatMap((candidate) => candidate.main)
      .filter((number) => !forcedSet.has(number));
    expect(nonForcedMains).toHaveLength(21);
    expect(new Set(nonForcedMains).size).toBe(21);
    expect(result.traceLines.join("\n")).toContain("forced-aware");
    expect(result.traceLines.join("\n")).toContain("exclusions=5");
    expect(result.traceLines.join("\n")).toContain("forced=3");
  });

  it("falls back to row-safe random fill when exclusions make a global 42-main partition impossible", () => {
    const result = generateRwR45Candidates(seededRandom(123), {
      excludedNumbers: [1, 2, 3, 4, 5, 6, 7],
    });
    const excludedSet = new Set([1, 2, 3, 4, 5, 6, 7]);

    expect(result.candidates).toHaveLength(7);
    for (const candidate of result.candidates) {
      const nums = [...candidate.main, ...candidate.supp];
      expect(candidate.main).toHaveLength(6);
      expect(candidate.supp).toHaveLength(2);
      expect(new Set(nums).size).toBe(8);
      expect(nums.some((number) => excludedSet.has(number))).toBe(false);
    }
    expect(result.traceLines.join("\n")).toContain("row-safe fallback");
  });

  it("honors monthly Acceptance Needs minimum counts when supplied", () => {
    const buckets = bucketSets({
      undrawn: [1, 2, 3, 4, 5, 6],
      times1: [7, 8, 9, 10, 11, 12],
      times2: Array.from({ length: 33 }, (_, index) => index + 13),
    });
    const result = generateRwR45Candidates(seededRandom(20260725), {
      monthlyAcceptanceNeeds: {
        constraints: constraints({ undrawn: 2, times1: 1 }),
        buckets,
      },
    });

    expect(result.candidates).toHaveLength(7);
    for (const candidate of result.candidates) {
      const numbers = [...candidate.main, ...candidate.supp];
      expect(numbers).toHaveLength(8);
      expect(new Set(numbers).size).toBe(8);
      expect(countFromSet(numbers, buckets.undrawn)).toBeGreaterThanOrEqual(2);
      expect(countFromSet(numbers, buckets.times1)).toBeGreaterThanOrEqual(1);
    }
    expect(result.traceLines.join("\n")).toContain("monthly Acceptance Needs honored");
    expect(result.traceLines.join("\n")).toContain("0x≥2 · 1x≥1");
  });

  it("blocks impossible monthly Acceptance Needs instead of returning false rows", () => {
    const buckets = bucketSets({
      undrawn: [1, 2, 3, 4, 5],
      times1: [6, 7, 8, 9, 10],
      times2: Array.from({ length: 35 }, (_, index) => index + 11),
    });
    const result = generateRwR45Candidates(seededRandom(20260726), {
      monthlyAcceptanceNeeds: {
        constraints: constraints({ undrawn: 5, times1: 4 }),
        buckets,
      },
    });

    expect(result.candidates).toEqual([]);
    expect(result.traceLines.join("\n")).toContain("monthly Acceptance Needs blocked");
    expect(result.traceLines.join("\n")).toContain("requested 9 bucket-required numbers per row");
  });
});
