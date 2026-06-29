import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { backtestDroughtPredictions } from "./backtestDrought";
import { computeDroughtHazard } from "./droughtHazard";

const draw = (main: number[], supp: number[], date: string): Draw => ({ main, supp, date });

const expectedHazardTop = (history: Draw[], topK: number): number[] => (
  computeDroughtHazard(history)
    .byNumber
    .slice()
    .sort((left, right) => right.p - left.p || right.k - left.k || left.number - right.number)
    .slice(0, topK)
    .map((row) => row.number)
);

describe("backtestDroughtPredictions", () => {
  it("walks forward with the same empirical drought hazard ranking used by the DGA panel", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-03"),
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-05"),
      draw([17, 18, 19, 20, 21, 22], [23, 24], "2026-01-07"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-10"),
    ];

    const summary = backtestDroughtPredictions(history, {
      minHistory: 3,
      useRollingWindow: false,
      topK: 6,
    });

    expect(summary.records).toHaveLength(2);
    expect(summary.records[0].topK).toEqual(expectedHazardTop(history.slice(0, 3), 6));
    expect(summary.records[1].topK).toEqual(expectedHazardTop(history.slice(0, 4), 6));
    expect(summary.baseline.topKAnyHitProbability).toBeGreaterThan(0);
    expect(summary.baseline.expectedHitsInTopK).toBeCloseTo(6 * 8 / 45, 10);
  });
});
