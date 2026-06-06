import { describe, expect, it } from "vitest";
import {
  analyzeSurvival,
  calibrateSurvivalProbabilities,
  selectTopSurvivalNumbers,
} from "./survivalAnalysis";
import type { Draw } from "../types";

const draw = (main: number[], supp: number[] = [], date = "2026-01-01"): Draw => ({
  date,
  main,
  supp,
});

describe("analyzeSurvival", () => {
  it("assigns high next-hit probability to a number repeatedly observed at the current drought", () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      draw([1, 2, 3, 4, 5, 6], [], `2026-01-${String(index + 1).padStart(2, "0")}`)
    );

    const analysis = analyzeSurvival(history, { includeSupp: false });
    const numberOne = analysis.rows.find((row) => row.number === 1);
    const numberFortyFive = analysis.rows.find((row) => row.number === 45);

    expect(numberOne?.currentDrought).toBe(0);
    expect(numberOne?.baseProbability).toBeGreaterThan(0.8);
    expect(numberFortyFive?.currentDrought).toBe(12);
    expect(numberFortyFive?.baseProbability).toBeLessThan(0.2);
  });

  it("sanitizes invalid and duplicate numbers before estimating exposure", () => {
    const analysis = analyzeSurvival([
      draw([1, 1, 2, 0, 46, 3], [4, 4, 99]),
      draw([1, 2, 3, 4, 5, 6], [7, 8]),
    ], { includeSupp: true });

    expect(analysis.quality.invalidNumberEntries).toBe(3);
    expect(analysis.quality.duplicateNumberEntries).toBe(2);
    expect(analysis.quality.drawsWithShortSelection).toBe(1);
    expect(analysis.summary.meanValidSelections).toBe(6);
  });
});

describe("calibrateSurvivalProbabilities", () => {
  it("keeps biased probabilities finite and calibrated to the expected draw size", () => {
    const baseRows = Array.from({ length: 45 }, (_, index) => ({
      number: index + 1,
      baseProbability: 0.2,
      excluded: false,
    }));

    const calibrated = calibrateSurvivalProbabilities(baseRows, {
      biasWeights: { 1: 1_000_000 },
      gamma: 3,
      expectedSelections: 6,
    });

    const total = calibrated.reduce((sum, row) => sum + row.biasedProbability, 0);
    expect(total).toBeCloseTo(6, 6);
    expect(calibrated.every((row) => Number.isFinite(row.biasedProbability))).toBe(true);
    expect(calibrated.every((row) => row.biasedProbability >= 0 && row.biasedProbability <= 1)).toBe(true);
  });

  it("assigns zero biased probability to excluded numbers", () => {
    const calibrated = calibrateSurvivalProbabilities([
      { number: 1, baseProbability: 0.5, excluded: true },
      { number: 2, baseProbability: 0.5, excluded: false },
    ], {
      biasWeights: { 1: 10, 2: 1 },
      gamma: 2,
      expectedSelections: 1,
    });

    expect(calibrated.find((row) => row.number === 1)?.biasedProbability).toBe(0);
    expect(calibrated.find((row) => row.number === 2)?.biasedProbability).toBe(1);
  });
});

describe("selectTopSurvivalNumbers", () => {
  it("reports impossible forced-number requests instead of silently dropping numbers", () => {
    const rows = Array.from({ length: 45 }, (_, index) => ({
      number: index + 1,
      biasedProbability: (45 - index) / 45,
      excluded: false,
    }));

    const selection = selectTopSurvivalNumbers(rows, {
      forcedNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      excludedNumbers: [2],
      limit: 8,
    });

    expect(selection.numbers).toHaveLength(8);
    expect(selection.numbers).not.toContain(2);
    expect(selection.warning).toContain("forced");
  });
});
