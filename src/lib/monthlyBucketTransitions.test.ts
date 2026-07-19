import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyBucketTransitions,
  buildMonthlyBucketTransitionMonths,
  buildMonthlyTransitionNumberContext,
} from "./monthlyBucketTransitions";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildMonthlyBucketTransitionMonths", () => {
  it("records before-draw bucket transitions without lookahead", () => {
    const months = buildMonthlyBucketTransitionMonths([
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
    ]);

    expect(months).toHaveLength(1);
    const june = months[0];
    expect(june.drawStates[0].distribution[0]).toBe(37);
    expect(june.drawStates[0].distribution[1]).toBe(8);

    const numberOneSecondDraw = june.events.find((event) => (
      event.drawOrdinal === 2 && event.number === 1
    ));
    const numberTwoSecondDraw = june.events.find((event) => (
      event.drawOrdinal === 2 && event.number === 2
    ));

    expect(numberOneSecondDraw).toMatchObject({
      beforeBucket: 1,
      afterBucket: 2,
      drawn: true,
    });
    expect(numberTwoSecondDraw).toMatchObject({
      beforeBucket: 1,
      afterBucket: 1,
      drawn: false,
    });
  });
});

describe("analyzeMonthlyBucketTransitions", () => {
  it("excludes the bundled opening partial month from transition baselines", () => {
    const analysis = analyzeMonthlyBucketTransitions([
      draw("2024-05-31", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-06-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-06-05", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2024-07-01", [16, 17, 18, 19, 20, 21], [22, 23]),
      draw("2024-07-03", [16, 24, 25, 26, 27, 28], [29, 30]),
    ], { monthLength: "all" });

    expect(analysis.excludedOpeningMonthLabels).toEqual(["2024-05"]);
    expect(analysis.allMonthCount).toBe(3);
    expect(analysis.baselineMonthCount).toBe(2);
    expect(analysis.warnings.join(" ")).toContain("Opening partial month excluded");
  });

  it("computes stage-specific undrawn break evidence and current expectations", () => {
    const analysis = analyzeMonthlyBucketTransitions([
      draw("2024-05-31", [31, 32, 33, 34, 35, 36], [37, 38]),
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-07-01", [16, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-07-03", [16, 24, 25, 26, 27, 28], [29, 30]),
    ], { monthLength: "all", priorStrength: 0 });

    const d1 = analysis.undrawnSurvivalRows.find((row) => row.drawOrdinal === 1);
    const d2 = analysis.undrawnSurvivalRows.find((row) => row.drawOrdinal === 2);

    expect(d1).toMatchObject({
      trials: 90,
      breaks: 16,
      monthsWithStage: 2,
    });
    expect(d1?.rawBreakRate).toBeCloseTo(16 / 90);
    expect(d2).toMatchObject({
      trials: 74,
      breaks: 14,
      monthsWithStage: 2,
    });

    expect(analysis.planningState).toMatchObject({
      source: "current-month",
      monthLabel: "2026-07",
      completedDrawCount: 2,
      nextDrawOrdinal: 3,
    });
    expect(analysis.currentExpectations.some((row) => row.currentCount > 0)).toBe(true);
  });

  it("maps each number to its current monthly transition context", () => {
    const analysis = analyzeMonthlyBucketTransitions([
      draw("2024-05-31", [31, 32, 33, 34, 35, 36], [37, 38]),
      draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-06-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-07-01", [16, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-07-03", [16, 24, 25, 26, 27, 28], [29, 30]),
    ], { monthLength: "all", priorStrength: 0 });

    const context = buildMonthlyTransitionNumberContext(analysis);
    expect(context.size).toBe(45);
    expect(context.get(16)).toMatchObject({
      bucket: 2,
      label: "2x",
    });
    expect(context.get(17)).toMatchObject({
      bucket: 1,
      label: "1x",
    });
    expect(context.get(1)).toMatchObject({
      bucket: 0,
      label: "Undrawn",
    });
    expect(context.get(16)?.planningAverageRate).toBeGreaterThanOrEqual(0);
    expect(context.get(16)?.support).toMatch(/above|neutral|below|thin/);
  });
});
