import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeDroughtBucketMaturity } from "./droughtBucketMaturity";

const draw = (date: string, numbers: number[]): Draw => ({
  date,
  main: numbers.slice(0, 6),
  supp: numbers.slice(6, 8),
});

const currentHistory = [
  draw("2025-12-31", [2, 3, 4, 5, 6, 7, 8, 45]),
  draw("2026-01-02", [1, 2, 3, 4, 5, 6, 7, 8]),
  draw("2026-01-05", [1, 9, 10, 11, 12, 13, 14, 15]),
  draw("2026-01-07", [2, 3, 4, 5, 6, 7, 8, 9]),
  draw("2026-01-09", [10, 11, 12, 13, 14, 15, 16, 17]),
  draw("2026-01-12", [18, 19, 20, 21, 22, 23, 24, 25]),
  draw("2026-01-14", [26, 27, 28, 29, 30, 31, 32, 33]),
];

describe("analyzeDroughtBucketMaturity", () => {
  it("distinguishes a positive-bucket structural boundary from a 0x long drought", () => {
    const result = analyzeDroughtBucketMaturity({
      baselineHistory: currentHistory,
      currentHistory,
      targetDrawDate: "2026-01-16",
      targetMonthLabel: "2026-01",
      targetDrawOrdinal: 7,
      targetMonthExpectedDrawCount: 13,
      warmupDraws: 0,
    });
    const one = result.byNumber.find((row) => row.number === 1);
    const fortyFive = result.byNumber.find((row) => row.number === 45);

    expect(one).toMatchObject({
      bucketCount: 2,
      currentDrought: 4,
      structuralMaxDrought: 4,
      status: "at-boundary",
    });
    expect(fortyFive).toMatchObject({
      bucketCount: 0,
      currentDrought: 6,
      structuralMaxDrought: null,
    });
  });

  it("uses the target draw only as the outcome for its pre-draw comparison state", () => {
    const baselineHistory = [
      ...currentHistory,
      draw("2026-01-16", [1, 34, 35, 36, 37, 38, 39, 40]),
    ];
    const result = analyzeDroughtBucketMaturity({
      baselineHistory,
      currentHistory,
      targetDrawDate: "2026-01-16",
      targetMonthLabel: "2026-01",
      targetDrawOrdinal: 7,
      targetMonthExpectedDrawCount: 13,
      warmupDraws: 0,
    });
    const one = result.byNumber.find((row) => row.number === 1);

    expect(one?.tailTrials).toBeGreaterThanOrEqual(1);
    expect(one?.tailHitsNext).toBeGreaterThanOrEqual(1);
    expect(one?.status).toBe("at-boundary");
  });

  it("remains independent of the strict six-draw episode threshold", () => {
    const result = analyzeDroughtBucketMaturity({
      baselineHistory: currentHistory,
      currentHistory,
      targetDrawDate: "2026-01-16",
      targetMonthLabel: "2026-01",
      targetDrawOrdinal: 7,
      targetMonthExpectedDrawCount: 13,
      warmupDraws: 0,
    });

    expect(result.byNumber.find((row) => row.number === 1)).toMatchObject({
      currentDrought: 4,
      status: "at-boundary",
    });
  });
});
