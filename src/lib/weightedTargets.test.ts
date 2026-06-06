import { describe, expect, it } from "vitest";

import {
  buildWeightedTargetModel,
  computeWeightedMatchFloor,
  normalizeWeightedTargets,
  normalizeWeightedTargetNumbers,
} from "./weightedTargets";

describe("weighted target normalization", () => {
  it("keeps only valid selected numbers and clamps malformed weights", () => {
    const selected = normalizeWeightedTargetNumbers([5, "9", 5, 0, 46, 12.4, Number.POSITIVE_INFINITY]);
    const normalized = normalizeWeightedTargets(selected, {
      5: 2.25,
      9: -4,
      12: Number.POSITIVE_INFINITY,
      40: 8,
    } as Record<number, number>);

    expect(selected).toEqual([5, 9]);
    expect(normalized).toEqual({
      5: 2.25,
      9: 0.1,
    });
  });

  it("computes the weighted floor from the requested raw match count", () => {
    const selected = [1, 2, 3, 4, 5, 6];
    const weights = normalizeWeightedTargets(selected, {
      1: 9,
      2: 2,
      3: 4,
      4: 1,
      5: 5,
      6: 3,
    });

    expect(computeWeightedMatchFloor(selected, weights, 4)).toBe(10);
    expect(computeWeightedMatchFloor(selected, weights, 2)).toBe(3);
    expect(computeWeightedMatchFloor(selected, weights, 8)).toBe(24);
  });
});

describe("buildWeightedTargetModel", () => {
  it("reports normalized share and effective target count", () => {
    const model = buildWeightedTargetModel([1, 2, 3, 4], {
      1: 10,
      2: 1,
      3: 1,
      4: 1,
      45: 7,
    });

    expect(model.rows).toHaveLength(4);
    expect(model.rows[0]).toMatchObject({ number: 1, weight: 10 });
    expect(model.summary.totalWeight).toBe(13);
    expect(model.summary.staleEntryCount).toBe(1);
    expect(model.summary.weightedMatchFloor).toBe(13);
    expect(model.summary.effectiveTargetCount).toBeCloseTo(1.64, 2);
    expect(model.rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 8);
  });
});
