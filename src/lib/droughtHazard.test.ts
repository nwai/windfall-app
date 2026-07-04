import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
  computeDroughtHazard,
  computeStrictDroughtShortlist,
} from "./droughtHazard";

const draw = (main: number[], supp: number[], date: string): Draw => ({ main, supp, date });

describe("computeDroughtHazard", () => {
  it("uses the drought length after the current draw when estimating next-draw appearance", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-03"),
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-05"),
    ];

    const result = computeDroughtHazard(history);

    expect(result.scope).toBe("mains+supps");
    expect(result.baselineProbability).toBe(DROUGHT_HAZARD_ANY_DRAWN_BASELINE);

    const k0 = result.exposureByDrought[0];
    const k1 = result.exposureByDrought[1];
    const k2 = result.exposureByDrought[2];

    expect(k0).toMatchObject({ k: 0, trials: 16, hitsNext: 0 });
    expect(k1).toMatchObject({ k: 1, trials: 45, hitsNext: 16 });
    expect(k2).toMatchObject({ k: 2, trials: 29, hitsNext: 0 });

    const numberSeven = result.byNumber.find((row) => row.number === 7);
    const numberNine = result.byNumber.find((row) => row.number === 9);

    expect(numberSeven?.k).toBe(0);
    expect(numberNine?.k).toBe(1);
    expect(numberNine?.trials).toBe(45);
    expect(numberNine?.hitsNext).toBe(16);
    expect(numberNine?.p).toBeCloseTo((16 + DROUGHT_HAZARD_ANY_DRAWN_BASELINE * 2) / (45 + 2), 10);
  });

  it("returns finite baseline-shrunk rows for empty history", () => {
    const result = computeDroughtHazard([]);

    expect(result.byNumber).toHaveLength(45);
    expect(result.byNumber.every((row) => Number.isFinite(row.p))).toBe(true);
    expect(result.byNumber.every((row) => row.p === 0)).toBe(true);
    expect(result.exposureByDrought[0]).toMatchObject({ k: 0, trials: 0, hitsNext: 0 });
  });
});

describe("computeStrictDroughtShortlist", () => {
  it("uses active-window absence for context but ranks strict rows by full-history current drought first", () => {
    const history = [
      draw([1, 3, 4, 5, 6, 7], [8, 9], "2026-01-01"),
      draw([2, 3, 4, 5, 6, 7], [8, 9], "2026-01-03"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-05"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-07"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-09"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-11"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-13"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-15"),
      draw([3, 4, 5, 6, 7, 8], [9, 10], "2026-01-17"),
    ];

    const result = computeStrictDroughtShortlist(history.slice(-6), history, { threshold: 6 });

    expect(result.rows[0]).toMatchObject({
      number: 1,
      activeWindowDrought: 6,
      currentDrought: 8,
      strictRank: 1,
    });
    expect(result.rows[1]).toMatchObject({
      number: 2,
      activeWindowDrought: 6,
      currentDrought: 7,
      strictRank: 2,
    });
  });

  it("counts only completed drought episodes after a prior observed appearance", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-03"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-05"),
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-07"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-09"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-11"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-13"),
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-15"),
      draw([1, 2, 3, 4, 6, 7], [8, 9], "2026-01-17"),
    ];

    const result = computeStrictDroughtShortlist(history, history, { threshold: 2 });
    const five = result.byNumber.find((row) => row.number === 5);

    expect(five).toMatchObject({
      historicalDroughtEpisodes: 2,
      medianBreakLength: 2.5,
      p75BreakLength: 3,
      longestBreakLength: 3,
      currentDrought: 1,
    });
  });
});
