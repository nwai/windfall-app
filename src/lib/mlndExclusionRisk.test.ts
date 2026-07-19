import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  buildMlndHistoryScope,
  buildMlndRiskAnalysis,
  runMlndWalkForwardBacktest,
} from "./mlndExclusionRisk";

const makeDraw = (date: string, offset: number): Draw => {
  const numbers = Array.from({ length: 8 }, (_, index) => ((offset + index) % 45) + 1);
  return {
    date,
    main: numbers.slice(0, 6),
    supp: numbers.slice(6, 8),
  };
};

const isoDate = (start: string, daysAfter: number): string => {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysAfter);
  return date.toISOString().slice(0, 10);
};

const buildHistory = (): Draw[] => [
  makeDraw("2024-05-20", 0),
  makeDraw("2024-05-22", 7),
  makeDraw("2024-05-24", 14),
  makeDraw("2024-05-27", 21),
  makeDraw("2024-05-29", 28),
  makeDraw("2024-05-31", 35),
  ...Array.from({ length: 76 }, (_, index) => makeDraw(isoDate("2024-06-03", index * 2), index * 5)),
];

describe("mlndExclusionRisk", () => {
  it("uses Windfall All History by excluding the opening partial month from baseline evidence", () => {
    const scope = buildMlndHistoryScope(buildHistory());

    expect(scope.originalDrawCount).toBe(82);
    expect(scope.excludedMonthLabels).toEqual(["2024-05"]);
    expect(scope.usedDrawCount).toBe(76);
    expect(scope.firstDate).toBe("2024-06-03");
  });

  it("builds exact exclusion and allowed-number complements for the selected budget", () => {
    const analysis = buildMlndRiskAnalysis(buildHistory(), {
      scope: "mainAndSupp",
      budget: 37,
      minTrainingDraws: 24,
      bootstrapIters: 20,
    });

    expect(analysis.excludedNumbers).toHaveLength(37);
    expect(analysis.allowedNumbers).toHaveLength(8);
    expect(new Set([...analysis.excludedNumbers, ...analysis.allowedNumbers]).size).toBe(45);
    expect(analysis.excludedNumbers.some((number) => analysis.allowedNumbers.includes(number))).toBe(false);
  });

  it("reports the exact random false-exclusion baseline for walk-forward validation", () => {
    const scopedHistory = buildMlndHistoryScope(buildHistory()).history;
    const result = runMlndWalkForwardBacktest(scopedHistory, {
      scope: "mainAndSupp",
      budget: 37,
      minTrainingDraws: 24,
      bootstrapIters: 20,
    });

    expect(result.drawsEvaluated).toBe(scopedHistory.length - 24);
    expect(result.randomMeanFalseExcluded).toBeCloseTo((37 * 8) / 45, 8);
    expect(result.meanCorrectExclusions).toBeCloseTo(37 - result.meanFalseExcluded, 8);
  });
});
