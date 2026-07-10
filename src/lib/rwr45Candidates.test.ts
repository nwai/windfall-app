import { describe, expect, it } from "vitest";

import { generateRwR45Candidates } from "./rwr45Candidates";

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

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
});
