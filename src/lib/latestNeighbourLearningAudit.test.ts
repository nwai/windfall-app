import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeLatestNeighbourLearningAudit,
  LATEST_NEIGHBOUR_LEARNING_VERSION,
  LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE,
} from "./latestNeighbourLearningAudit";

const scheduledDraws = (count: number): Draw[] => {
  const draws: Draw[] = [];
  const date = new Date(2025, 0, 1);
  let index = 0;
  while (draws.length < count) {
    if ([1, 3, 5].includes(date.getDay())) {
      const start = (index * 7) % 45;
      const numbers = Array.from({ length: 8 }, (_, offset) => ((start + (offset * 5)) % 45) + 1);
      draws.push({
        date: `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`,
        main: numbers.slice(0, 6),
        supp: numbers.slice(6),
      });
      index += 1;
    }
    date.setDate(date.getDate() + 1);
  }
  return draws;
};

describe("latestNeighbourLearningAudit", () => {
  it("replays the fixed live screens with equal-size random references", () => {
    const result = analyzeLatestNeighbourLearningAudit(scheduledDraws(90), {
      currentMode: "pm1pm2",
      now: "2025-08-01",
    });

    expect(result.modelVersion).toBe(LATEST_NEIGHBOUR_LEARNING_VERSION);
    expect(result.validHistoryDraws).toBe(90);
    expect(result.records).toHaveLength(66);
    expect(result.summaries.map((row) => row.mode)).toEqual(["pm1", "pm1pm2"]);
    expect(result.currentMode).toBe("pm1pm2");
    expect(result.currentGate.status).not.toBe("insufficient");
    expect(result.modePreference.status).not.toBe("insufficient");

    const first = result.records[0];
    expect(first.pm1.expectedHits).toBeCloseTo(first.pm1.targetCount * LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE);
    expect(first.pm1pm2.expectedAnyHitRate).toBeGreaterThanOrEqual(0);
    expect(first.pm1pm2.expectedAnyHitRate).toBeLessThanOrEqual(1);
    expect(first.pm1pm2.screenedOutCount).toBeGreaterThanOrEqual(0);
  });

  it("does not let later draws alter already-scored walk-forward rows", () => {
    const draws = scheduledDraws(100);
    const earlier = analyzeLatestNeighbourLearningAudit(draws.slice(0, 80), {
      now: "2025-08-01",
    });
    const later = analyzeLatestNeighbourLearningAudit(draws, {
      now: "2025-08-01",
    });

    expect(later.records.slice(0, earlier.records.length)).toEqual(earlier.records);
  });

  it("excludes simulated, off-schedule, malformed, and duplicate-date rows", () => {
    const draws = scheduledDraws(40);
    const result = analyzeLatestNeighbourLearningAudit([
      ...draws,
      { ...draws[0] },
      { date: "1/2/25", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "1/6/25", main: [1, 1, 2, 3, 4, 5], supp: [6, 7] },
      { date: "1/8/25", main: [1, 2, 3, 4, 5, 6], supp: [7, 8], isSimulated: true },
    ], { now: "2025-04-15" });

    expect(result.validHistoryDraws).toBe(40);
    expect(result.excludedHistoryRows).toBe(4);
    expect(result.records).toHaveLength(16);
    expect(result.currentOutcomes).toHaveLength(2);
  });
});
