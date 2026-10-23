import { describe, expect, it, vi } from "vitest";

import type { Draw } from "../types";
import {
  analyzeConsecutiveRunMonthlyWatch,
  exactConsecutiveRunProbability,
  findConsecutiveNumberRuns,
} from "./consecutiveRunMonthlyWatch";

const safeNumbers = [1, 5, 9, 13, 17, 21, 25, 29];
const runNumbers = [1, 2, 3, 13, 17, 21, 25, 29];

const drawFor = (date: string, numbers: readonly number[]): Draw => ({
  date,
  main: [...numbers.slice(0, 6)],
  supp: [...numbers.slice(6, 8)],
});

const scheduledMonth = (year: number, month: number, eventOrdinals: readonly number[] = []): Draw[] => {
  const rows: Draw[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    if (![1, 3, 5].includes(date.getDay())) continue;
    const ordinal = rows.length + 1;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    rows.push(drawFor(iso, eventOrdinals.includes(ordinal) ? runNumbers : safeNumbers));
  }
  return rows;
};

describe("Consecutive Run Monthly Watch", () => {
  it("uses the exact unordered 8-from-45 random baseline", () => {
    const exact = exactConsecutiveRunProbability();

    expect(exact.totalCombinations).toBe(215_553_195);
    expect(exact.matchingCombinations).toBe(31_804_461);
    expect(exact.probability).toBeCloseTo(0.14754808436, 10);
  });

  it("detects a qualifying run that crosses from mains into supplementaries", () => {
    const runs = findConsecutiveNumberRuns([4, 8, 12, 16, 24, 25, 26, 40]);

    expect(runs).toEqual([{
      start: 24,
      end: 26,
      length: 3,
      numbers: [24, 25, 26],
    }]);
  });

  it("separates any-run frequency from first-occurrence survival at D13", () => {
    const history = [
      drawFor("2024-05-20", safeNumbers),
      ...scheduledMonth(2024, 8, [13]),
      ...scheduledMonth(2024, 9),
      ...scheduledMonth(2024, 10, [13]),
    ];
    const result = analyzeConsecutiveRunMonthlyWatch(history, { now: "2024-11-01" });
    const d13 = result.stageRows.find((row) => row.drawOrdinal === 13);

    expect(result.excludedOpeningMonthLabels).toEqual(["2024-05"]);
    expect(result.completedMonthCount).toBe(3);
    expect(result.completedMonthsWithOccurrence).toBe(2);
    expect(d13).toMatchObject({
      trials: 3,
      occurrenceCount: 2,
      firstRiskTrials: 3,
      firstOccurrenceCount: 2,
      sampleQuality: "Very thin",
    });
    expect(d13?.conditionalFirstRate).toBeCloseTo(2 / 3);
  });

  it("ignores simulated and malformed rows instead of converting them into evidence", () => {
    const history: Draw[] = [
      ...scheduledMonth(2024, 8, [2]),
      { ...drawFor("2024-09-02", runNumbers), isSimulated: true },
      { date: "2024-09-03", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-09-04", main: [1, 2, 3, 4, 5, 6], supp: [6, 8] },
    ];
    const result = analyzeConsecutiveRunMonthlyWatch(history, { now: "2024-09-06" });

    expect(result.simulatedRowsIgnored).toBe(1);
    expect(result.excludedHistoryRows).toBe(2);
    expect(result.monthRows.find((month) => month.monthLabel === "2024-09")).toBeUndefined();
  });

  it("excludes a month with a missing earlier draw from first-occurrence stage evidence", () => {
    const incompleteSeptember = scheduledMonth(2024, 9, [2]).slice(1, 3);
    const result = analyzeConsecutiveRunMonthlyWatch([
      ...scheduledMonth(2024, 8),
      ...incompleteSeptember,
    ], { now: "2024-09-06" });
    const d2 = result.stageRows.find((row) => row.drawOrdinal === 2);

    expect(d2).toMatchObject({
      trials: 1,
      occurrenceCount: 0,
      firstRiskTrials: 1,
      firstOccurrenceCount: 0,
    });
    expect(result.currentState?.observationCompleteThroughLatestDraw).toBe(false);
    expect(result.currentState?.firstOccurrenceOrdinal).toBeNull();
    expect(result.warnings).toContain(
      "1 month with missing earlier scheduled draws is excluded from affected draw-stage evidence.",
    );
  });

  it("rebuilds Strict and Empirical run cross-checks from prior draws only", () => {
    const august = scheduledMonth(2024, 8);
    const september = scheduledMonth(2024, 9, [13]);
    const history = [...august, ...september];
    const target = september[12];
    const strictBuilder = vi.fn((_training: Draw[]) => [1, 2]);
    const empiricalBuilder = vi.fn((_training: Draw[]) => [3]);

    const result = analyzeConsecutiveRunMonthlyWatch(history, {
      now: "2024-10-01",
      droughtCrossCheck: {
        minTrainingDraws: 1,
        topK: 8,
        strictShortlistBuilder: strictBuilder,
        empiricalShortlistBuilder: empiricalBuilder,
      },
    });
    const crossCheck = result.droughtKeyCrossCheck;
    const strict = crossCheck.familyRows.find((row) => row.family === "strict");
    const empirical = crossCheck.familyRows.find((row) => row.family === "empirical");
    const union = crossCheck.familyRows.find((row) => row.family === "union");

    expect(strictBuilder).toHaveBeenCalledTimes(1);
    expect(empiricalBuilder).toHaveBeenCalledTimes(1);
    const trainingHistory = strictBuilder.mock.calls[0][0];
    expect(trainingHistory).toHaveLength(history.findIndex((draw) => draw.date === target.date));
    expect(trainingHistory.some((draw) => draw.date === target.date)).toBe(false);
    expect(crossCheck).toMatchObject({
      modelVersion: "CRMW-DK-1",
      eligibleTargetDraws: 1,
      eligibleRunSequences: 1,
    });
    expect(strict).toMatchObject({ observedSequenceCount: 1, sequenceTrials: 1 });
    expect(strict?.expectedSequenceRate).toBeCloseTo(2 / 43);
    expect(empirical).toMatchObject({ observedSequenceCount: 1, sequenceTrials: 1 });
    expect(empirical?.expectedSequenceRate).toBeCloseTo(3 / 43);
    expect(union?.expectedSequenceRate).toBeCloseTo(3 / 43);
    expect(crossCheck.sourceRows.find((row) => row.source === "strict-only")).toMatchObject({
      memberCount: 2,
      sequenceCount: 1,
    });
    expect(crossCheck.sourceRows.find((row) => row.source === "empirical-only")).toMatchObject({
      memberCount: 1,
      sequenceCount: 1,
    });
  });
});
