import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeDroughtLearningAudit,
  DROUGHT_LEARNING_MIN_HISTORY,
  DROUGHT_LEARNING_MODEL_VERSION,
  DROUGHT_LEARNING_PROMOTION_TRIALS,
} from "./droughtLearningAudit";

const DAY_MS = 86_400_000;

const scheduledDates = (count: number): string[] => {
  const dates: string[] = [];
  let time = new Date(2024, 0, 1).getTime();
  while (dates.length < count) {
    const date = new Date(time);
    if ([1, 3, 5].includes(date.getDay())) {
      dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    }
    time += DAY_MS;
  }
  return dates;
};

const buildHistory = (count: number): Draw[] => {
  let state = 73129;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return scheduledDates(count).map((date) => {
    const pool = Array.from({ length: 45 }, (_, index) => index + 1);
    for (let index = 0; index < 8; index += 1) {
      const swap = index + Math.floor(random() * (pool.length - index));
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    const numbers = pool.slice(0, 8);
    return { date, main: numbers.slice(0, 6), supp: numbers.slice(6, 8) };
  });
};

const options = {
  targetMonthLabel: "2026-09",
  targetDrawOrdinal: 10,
  targetMonthExpectedDrawCount: 13,
};

describe("analyzeDroughtLearningAudit", () => {
  it("builds a progressive versioned audit without generation influence", () => {
    const history = buildHistory(96);
    const result = analyzeDroughtLearningAudit(history, options);

    expect(result.modelVersion).toBe(DROUGHT_LEARNING_MODEL_VERSION);
    expect(result.scope).toBe("mains+supps");
    expect(result.validHistoryDraws).toBe(history.length);
    expect(result.records.length).toBe(history.length - DROUGHT_LEARNING_MIN_HISTORY);
    expect(result.gate.trials).toBe(result.records.length);
    expect(result.calibrationRows.reduce((sum, row) => sum + row.trials, 0)).toBeGreaterThan(0);
  });

  it("never lets a target result change the ranking or learned rates formed before it", () => {
    const history = buildHistory(90);
    const first = analyzeDroughtLearningAudit(history, options);
    const frozen = first.records[first.records.length - 1];
    expect(frozen).toBeDefined();
    expect(frozen.challengerNumbers.length).toBeGreaterThan(0);

    const modified = history.map((draw) => ({ ...draw, main: [...draw.main], supp: [...draw.supp] }));
    const replacement = [
      ...frozen.challengerNumbers,
      ...Array.from({ length: 45 }, (_, index) => index + 1)
        .filter((number) => !frozen.challengerNumbers.includes(number)),
    ].slice(0, 8);
    modified[modified.length - 1] = {
      ...modified[modified.length - 1],
      main: replacement.slice(0, 6),
      supp: replacement.slice(6, 8),
    };
    const second = analyzeDroughtLearningAudit(modified, options);
    const rescored = second.records.find((record) => record.targetDate === frozen.targetDate);

    expect(rescored?.championNumbers).toEqual(frozen.championNumbers);
    expect(rescored?.challengerNumbers).toEqual(frozen.challengerNumbers);
    expect(rescored?.challengerPredictions.map((row) => row.learnedRate)).toEqual(
      frozen.challengerPredictions.map((row) => row.learnedRate),
    );
    expect(rescored?.challengerHitCount).toBe(frozen.challengerNumbers.length);
  });

  it("cannot promote the challenger before the declared minimum paired draws", () => {
    const history = buildHistory(DROUGHT_LEARNING_MIN_HISTORY + DROUGHT_LEARNING_PROMOTION_TRIALS - 1);
    const result = analyzeDroughtLearningAudit(history, options);

    expect(result.records.length).toBe(DROUGHT_LEARNING_PROMOTION_TRIALS - 1);
    expect(result.gate.status).toBe("insufficient");
    expect(result.gate.selectedModel).toBe("champion");
    expect(result.records.every((record) => record.policyModelBeforeDraw === "champion")).toBe(true);
  });

  it("excludes invalid and duplicate real rows from evidence", () => {
    const history = buildHistory(40);
    const duplicate = { ...history[10], main: [...history[10].main], supp: [...history[10].supp] };
    const invalidWeekday: Draw = { date: "2025-01-07", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] };
    const malformedSplit: Draw = { date: "2025-01-08", main: [1, 2, 3, 4, 5], supp: [6, 7, 8] };
    const result = analyzeDroughtLearningAudit([...history, duplicate, invalidWeekday, malformedSplit], options);

    expect(result.validHistoryDraws).toBe(history.length);
    expect(result.excludedHistoryRows).toBe(3);
  });
});
