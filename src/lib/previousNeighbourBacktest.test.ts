import { describe, expect, it } from "vitest";

import {
  analyzePreviousNeighbourBacktest,
  buildPreviousNeighbourTransition,
} from "./previousNeighbourBacktest";
import type { Draw } from "../types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("previousNeighbourBacktest", () => {
  it("separates duplicated ±1 neighbour targets from ordinary singleton targets", () => {
    const previous = draw("2026-01-01", [10, 12, 20, 30, 40, 1], [33, 35]);
    const current = draw("2026-01-03", [11, 34, 21, 5, 6, 7], [2, 44]);

    const transition = buildPreviousNeighbourTransition(previous, current, "mains-plus-supps");

    expect(transition).not.toBeNull();
    expect(transition?.duplicateTargets.map((entry) => ({
      target: entry.target,
      sources: entry.sources,
    }))).toEqual([
      { target: 11, sources: [10, 12] },
      { target: 34, sources: [33, 35] },
    ]);
    expect(transition?.duplicateHits.map((entry) => entry.target)).toEqual([11, 34]);
    expect(transition?.singletonHits.map((entry) => entry.target)).toEqual([2, 21]);
    expect(transition?.totalHitCount).toBe(4);
    expect(transition?.duplicateHitCount).toBe(2);
    expect(transition?.singletonHitCount).toBe(2);
    expect(transition?.expectedDuplicateHits).toBeCloseTo((8 * 2) / 45, 6);
  });

  it("runs candidate soft-rule backtests walk-forward without using the target draw for calibration", () => {
    const draws = [
      draw("2026-01-01", [10, 12, 20, 30, 40, 1], [33, 35]),
      draw("2026-01-03", [11, 34, 21, 5, 6, 7], [2, 44]),
      draw("2026-01-05", [9, 13, 19, 31, 39, 41], [32, 36]),
      draw("2026-01-08", [8, 14, 18, 32, 38, 42], [3, 37]),
      draw("2026-01-10", [7, 15, 17, 33, 37, 43], [4, 29]),
      draw("2026-01-12", [6, 16, 22, 34, 36, 44], [5, 28]),
    ];

    const result = analyzePreviousNeighbourBacktest(draws, {
      scope: "mains-plus-supps",
      warmupPairs: 2,
      candidatePoolSize: 40,
      selectedPerDraw: 5,
      permutationIterations: 100,
      seed: 7,
    });

    expect(result.validDraws).toBe(6);
    expect(result.transitionCount).toBe(5);
    expect(result.candidateBacktest.evaluatedDraws).toBe(3);
    expect(result.candidateBacktest.firstEvaluation).toEqual({
      targetTransitionIndex: 3,
      previousDate: "2026-01-05",
      currentDate: "2026-01-08",
      calibrationPairCount: 2,
    });
    expect(result.candidateBacktest.antiLookaheadNote).toContain("up to the previous transition only");
    expect(result.candidateBacktest.baselineAverageHits).toBeGreaterThanOrEqual(0);
    expect(result.candidateBacktest.softRuleAverageHits).toBeGreaterThanOrEqual(0);
    expect(result.candidateBacktest.pValueOneSidedImprovement).toBeGreaterThanOrEqual(0);
    expect(result.candidateBacktest.pValueOneSidedImprovement).toBeLessThanOrEqual(1);
  });

  it("sorts dated history chronologically before building transitions", () => {
    const newestFirst = [
      draw("2026-01-05", [9, 13, 19, 31, 39, 41], [32, 36]),
      draw("2026-01-03", [11, 34, 21, 5, 6, 7], [2, 44]),
      draw("2026-01-01", [10, 12, 20, 30, 40, 1], [33, 35]),
    ];

    const result = analyzePreviousNeighbourBacktest(newestFirst, {
      scope: "mains-plus-supps",
      warmupPairs: 10,
    });

    expect(result.transitions.map((transition) => `${transition.previousDate}->${transition.currentDate}`)).toEqual([
      "2026-01-01->2026-01-03",
      "2026-01-03->2026-01-05",
    ]);
  });
});
