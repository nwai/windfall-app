import { describe, expect, it } from "vitest";

import { buildBatesCandidate } from "./batesCandidate";

const uniformWeights = Array.from({ length: 45 }, () => 1 / 45);

describe("buildBatesCandidate", () => {
  it("rejects more forced numbers than the Bates ticket can honestly contain", () => {
    const result = buildBatesCandidate({
      forcedNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      excludedNumbers: [],
      weights: uniformWeights,
      rng: () => 0.5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Only 8 forced numbers");
    }
  });

  it("rejects impossible pools instead of returning an incomplete candidate", () => {
    const result = buildBatesCandidate({
      forcedNumbers: [1, 2],
      excludedNumbers: Array.from({ length: 43 }, (_, index) => index + 3),
      weights: uniformWeights,
      rng: () => 0.5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.availableCount).toBe(2);
    }
  });

  it("returns eight unique numbers when the request is feasible", () => {
    const result = buildBatesCandidate({
      forcedNumbers: [1, 2, 3],
      excludedNumbers: [45],
      weights: uniformWeights,
      rng: () => 0.5,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.main).toHaveLength(6);
      expect(result.candidate.supp).toHaveLength(2);
      expect(new Set(result.candidate.all)).toHaveProperty("size", 8);
      expect(result.candidate.all.slice(0, 3)).toEqual([1, 2, 3]);
      expect(result.candidate.all).not.toContain(45);
    }
  });
});
