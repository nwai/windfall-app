import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeDroughtHazardCalibration,
  DROUGHT_HAZARD_CALIBRATION_VERSION,
  requiredIndependentTrialsForMargin,
} from "./droughtHazardCalibration";

const scheduledDates = (count: number): string[] => {
  const dates: string[] = [];
  const cursor = new Date(2024, 0, 1);
  while (dates.length < count) {
    if ([1, 3, 5].includes(cursor.getDay())) {
      dates.push(`${cursor.getMonth() + 1}/${cursor.getDate()}/${String(cursor.getFullYear()).slice(-2)}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const makeHistory = (count: number): Draw[] => scheduledDates(count).map((date, index) => {
  const start = (index * 7) % 45;
  const numbers = Array.from({ length: 8 }, (_, offset) => ((start + (offset * 5)) % 45) + 1);
  return {
    date,
    main: numbers.slice(0, 6),
    supp: numbers.slice(6, 8),
  };
});

const makeUniformFixture = (count: number): Draw[] => {
  let state = 123456789;
  const next = (): number => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / (2 ** 32);
  };
  return scheduledDates(count).map((date) => {
    const pool = Array.from({ length: 45 }, (_, index) => index + 1);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(next() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return { date, main: pool.slice(0, 6), supp: pool.slice(6, 8) };
  });
};

describe("drought hazard calibration audit", () => {
  it("reports the transparent nominal sample requirements", () => {
    expect(requiredIndependentTrialsForMargin(0.05)).toBe(225);
    expect(requiredIndependentTrialsForMargin(0.03)).toBe(624);
    expect(requiredIndependentTrialsForMargin(0.02)).toBe(1404);
    expect(requiredIndependentTrialsForMargin(0.01)).toBe(5616);
  });

  it("learns sequentially and evaluates only after the selection warm-up", () => {
    const result = analyzeDroughtHazardCalibration(makeHistory(220), {
      minTrainingDraws: 30,
      selectionWarmupDraws: 10,
    });

    expect(result.version).toBe(DROUGHT_HAZARD_CALIBRATION_VERSION);
    expect(result.dataPolicy).toBe("validated-real-draws-only");
    expect(result.validHistoryDraws).toBe(220);
    expect(result.records).toHaveLength(190);
    expect(result.evaluationRecords).toHaveLength(180);
    expect(result.records[0]).toMatchObject({
      trainingDraws: 30,
      scoredDrawsBeforeSelection: 0,
      selectedPriorStrength: 2,
      selectionWasLearned: false,
    });
    expect(result.records[10]).toMatchObject({
      trainingDraws: 40,
      scoredDrawsBeforeSelection: 10,
      selectionWasLearned: true,
    });
    expect(result.numberStateChecks).toBe(180 * 45);
    expect(result.candidateRows.every((row) => row.scoredDraws === 190)).toBe(true);
  });

  it("does not allow a target draw to choose its own prior strength", () => {
    const original = makeHistory(150);
    const altered = original.map((draw) => ({ ...draw, main: [...draw.main], supp: [...draw.supp] }));
    altered[100] = {
      ...altered[100],
      main: [1, 2, 3, 4, 5, 6],
      supp: [7, 8],
    };

    const options = { minTrainingDraws: 30, selectionWarmupDraws: 10 };
    const first = analyzeDroughtHazardCalibration(original, options);
    const second = analyzeDroughtHazardCalibration(altered, options);
    const firstTarget = first.records.find((row) => row.trainingDraws === 100);
    const secondTarget = second.records.find((row) => row.trainingDraws === 100);

    expect(firstTarget?.selectedPriorStrength).toBe(secondTarget?.selectedPriorStrength);
    expect(firstTarget?.scoredDrawsBeforeSelection).toBe(secondTarget?.scoredDrawsBeforeSelection);
  });

  it("can retain the neutral benchmark without coercing its null sentinel to two trials", () => {
    const result = analyzeDroughtHazardCalibration(makeUniformFixture(300));

    expect(result.currentLearnedPriorStrength).toBeNull();
    expect(result.candidateRows[0]?.label).toBe("Neutral 8/45");
    expect(result.candidateRows[0]?.brierScore).toBeLessThan(
      result.candidateRows.find((row) => row.priorStrength === 2)?.brierScore ?? Number.POSITIVE_INFINITY,
    );
  });

  it("keeps earlier walk-forward rows unchanged when a later real draw is added", () => {
    const history = makeHistory(150);
    const shorter = analyzeDroughtHazardCalibration(history.slice(0, 149), {
      minTrainingDraws: 30,
      selectionWarmupDraws: 10,
    });
    const longer = analyzeDroughtHazardCalibration(history, {
      minTrainingDraws: 30,
      selectionWarmupDraws: 10,
    });

    expect(longer.records.slice(0, shorter.records.length)).toEqual(shorter.records);
  });

  it("excludes simulated, malformed, duplicate-date, and off-schedule rows", () => {
    const valid = makeHistory(80);
    const history: Draw[] = [
      ...valid,
      { ...valid[0], isSimulated: true },
      { ...valid[1] },
      { date: "1/2/24", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "bad-date", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "8/1/24", main: [1, 1, 2, 3, 4, 5], supp: [6, 7] },
    ];

    const result = analyzeDroughtHazardCalibration(history, {
      minTrainingDraws: 20,
      selectionWarmupDraws: 5,
    });

    expect(result.validHistoryDraws).toBe(80);
    expect(result.excludedHistoryRows).toBe(5);
  });
});
