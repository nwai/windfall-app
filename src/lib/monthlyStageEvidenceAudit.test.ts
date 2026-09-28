import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyStageEvidence,
  MONTHLY_STAGE_EVIDENCE_MODEL_VERSION,
} from "./monthlyStageEvidenceAudit";

const DAY_MS = 86_400_000;

const scheduledDraws = (startIso: string, count: number): Draw[] => {
  const start = new Date(`${startIso}T12:00:00`);
  const rows: Draw[] = [];
  let cursor = start.getTime();
  let drawIndex = 0;
  while (rows.length < count) {
    const date = new Date(cursor);
    if ([1, 3, 5].includes(date.getDay())) {
      const numbers = new Array(8).fill(0).map((_, offset) => ((drawIndex * 5 + offset * 7) % 45) + 1);
      rows.push({
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        main: numbers.slice(0, 6),
        supp: numbers.slice(6),
      });
      drawIndex += 1;
    }
    cursor += DAY_MS;
  }
  return rows;
};

describe("analyzeMonthlyStageEvidence", () => {
  it("uses a versioned strict walk-forward ledger that is unchanged by later draws", () => {
    const history = scheduledDraws("2024-06-03", 70);
    const targetDate = history[42].date;
    const throughTarget = analyzeMonthlyStageEvidence(history.slice(0, 43), {
      minPriorDraws: 8,
      now: history[43].date,
    });
    const withFuture = analyzeMonthlyStageEvidence(history, {
      minPriorDraws: 8,
      now: history[history.length - 1].date,
    });
    const firstRecord = throughTarget.records.find((record) => record.targetDate === targetDate);
    const laterRecord = withFuture.records.find((record) => record.targetDate === targetDate);

    expect(throughTarget.modelVersion).toBe(MONTHLY_STAGE_EVIDENCE_MODEL_VERSION);
    expect(firstRecord).toBeDefined();
    expect(laterRecord).toBeDefined();
    expect(laterRecord?.learnedBucketMix).toEqual(firstRecord?.learnedBucketMix);
    expect(laterRecord?.bucketBaselineMix).toEqual(firstRecord?.bucketBaselineMix);
    expect(laterRecord?.learnedBrier).toBe(firstRecord?.learnedBrier);
    expect(laterRecord?.comparableStageMonths).toBe(firstRecord?.comparableStageMonths);
  });

  it("excludes simulated, malformed, duplicate-date, off-schedule, and opening-partial evidence", () => {
    const history: Draw[] = [
      { date: "2024-05-31", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-06-03", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
      { date: "2024-06-03", main: [17, 18, 19, 20, 21, 22], supp: [23, 24] },
      { date: "2024-06-04", main: [17, 18, 19, 20, 21, 22], supp: [23, 24] },
      { date: "2024-06-05", main: [1, 2, 3, 4, 5, 6], supp: [6, 8] },
      { date: "2024-06-07", main: [25, 26, 27, 28, 29, 30], supp: [31, 32], isSimulated: true },
      { date: "2024-06-07", main: [25, 26, 27, 28, 29, 30], supp: [31, 32] },
    ];
    const result = analyzeMonthlyStageEvidence(history, { minPriorDraws: 1, now: "2024-06-10" });

    expect(result.validRealDraws).toBe(3);
    expect(result.baselineRealDraws).toBe(2);
    expect(result.excludedOpeningMonthLabels).toEqual(["2024-05"]);
    expect(result.excludedHistoryRows).toBe(3);
    expect(result.simulatedRowsIgnored).toBe(1);
    expect(result.scopeLabel).toContain("no target or later draw");
  });

  it("produces capacity-safe eight-number current bucket recipes", () => {
    const history = scheduledDraws("2024-06-03", 95);
    const result = analyzeMonthlyStageEvidence(history, {
      minPriorDraws: 12,
      now: new Date(new Date(`${history[history.length - 1].date}T12:00:00`).getTime() + DAY_MS),
    });
    const current = result.currentState;

    expect(current).not.toBeNull();
    expect(current?.bucketRows.reduce((sum, row) => sum + row.currentCount, 0)).toBe(45);
    expect(current?.learnedBucketMix.reduce((sum, value) => sum + value, 0)).toBe(8);
    expect(current?.bucketBaselineMix.reduce((sum, value) => sum + value, 0)).toBe(8);
    current?.bucketRows.forEach((row) => {
      expect(row.learnedTargetPicks).toBeLessThanOrEqual(row.currentCount);
      expect(row.bucketBaselineTargetPicks).toBeLessThanOrEqual(row.currentCount);
    });
    expect(result.ordinalRows.length).toBeGreaterThan(0);
    expect(result.calibrationRows.reduce((sum, row) => sum + row.trials, 0)).toBe(result.records.length * 45);
  });

  it("reports composition overlap on an honest zero-to-eight scale", () => {
    const result = analyzeMonthlyStageEvidence(scheduledDraws("2024-06-03", 55), {
      minPriorDraws: 6,
      now: "2024-10-14",
    });

    expect(result.records.length).toBeGreaterThan(0);
    result.records.forEach((record) => {
      expect(record.actualBucketMix.reduce((sum, value) => sum + value, 0)).toBe(8);
      expect(record.learnedOverlap).toBeGreaterThanOrEqual(0);
      expect(record.learnedOverlap).toBeLessThanOrEqual(8);
      expect(record.bucketBaselineOverlap).toBeGreaterThanOrEqual(0);
      expect(record.bucketBaselineOverlap).toBeLessThanOrEqual(8);
    });
    expect(result.randomTopEightExpectation).toBeCloseTo(64 / 45);
  });
});
