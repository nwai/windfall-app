import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeDgaAutoSuppLearningAudit,
  DGA_AUTO_SUPP_AUDIT_VERSION,
  DGA_AUTO_SUPP_RANDOM_EXACT_RATE,
  DGA_AUTO_SUPP_RANDOM_MEAN_HITS,
} from "./dgaAutoSuppLearningAudit";

const scheduledDates = (count: number): string[] => {
  const dates: string[] = [];
  const cursor = new Date(2025, 0, 1);
  while (dates.length < count) {
    if ([1, 3, 5].includes(cursor.getDay())) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const buildHistory = (count: number): Draw[] => scheduledDates(count).map((date, index) => {
  const numbers = Array.from({ length: 8 }, (_, offset) => ((index * 7 + offset * 5) % 45) + 1);
  const roleOffset = index % 8;
  const suppIndexes = new Set([roleOffset, (roleOffset + 3) % 8]);
  return {
    date,
    main: numbers.filter((_, numberIndex) => !suppIndexes.has(numberIndex)),
    supp: numbers.filter((_, numberIndex) => suppIndexes.has(numberIndex)),
  };
});

describe("analyzeDgaAutoSuppLearningAudit", () => {
  it("builds a versioned known-eight walk-forward replay", () => {
    const history = buildHistory(90);
    const selectedNumbers = [...history[history.length - 1].main, ...history[history.length - 1].supp];
    const result = analyzeDgaAutoSuppLearningAudit(history, {
      activeWindowSize: 13,
      selectedNumbers,
    });

    expect(result.modelVersion).toBe(DGA_AUTO_SUPP_AUDIT_VERSION);
    expect(result.records).toHaveLength(66);
    expect(result.records[0].trainingDraws).toBe(24);
    expect(result.records.at(-1)?.activeWindowDraws).toBe(13);
    expect(result.summaries.map((row) => row.model)).toEqual(["champion", "role-rate", "pair-blend"]);
    expect(result.currentPairs).toHaveLength(3);
    expect(result.currentPairs.every((row) => row.pair.length === 2)).toBe(true);
  });

  it("forms the final target recommendations before seeing its supplementary roles", () => {
    const history = buildHistory(90);
    const first = analyzeDgaAutoSuppLearningAudit(history, { activeWindowSize: 26 });
    const modified = history.map((draw) => ({ ...draw, main: [...draw.main], supp: [...draw.supp] }));
    const final = modified[modified.length - 1];
    const sameEight = [...final.main, ...final.supp];
    final.main = sameEight.slice(2);
    final.supp = sameEight.slice(0, 2);

    const second = analyzeDgaAutoSuppLearningAudit(modified, { activeWindowSize: 26 });
    const firstFinal = first.records.at(-1);
    const secondFinal = second.records.at(-1);

    expect(secondFinal?.champion.pair).toEqual(firstFinal?.champion.pair);
    expect(secondFinal?.roleRate.pair).toEqual(firstFinal?.roleRate.pair);
    expect(secondFinal?.pairBlend.pair).toEqual(firstFinal?.pairBlend.pair);
    expect(secondFinal?.gateStatusBeforeDraw).toBe(firstFinal?.gateStatusBeforeDraw);
  });

  it("keeps promotion unavailable before sixty paired target draws", () => {
    const result = analyzeDgaAutoSuppLearningAudit(buildHistory(70), { activeWindowSize: 13 });

    expect(result.records).toHaveLength(46);
    expect(result.currentMethodGate.status).toBe("insufficient");
    expect(result.gates.every((gate) => gate.status === "insufficient")).toBe(true);
    expect(result.selectedModel).toBe("champion");
  });

  it("uses the exact random known-eight role baselines", () => {
    expect(DGA_AUTO_SUPP_RANDOM_MEAN_HITS).toBe(0.5);
    expect(DGA_AUTO_SUPP_RANDOM_EXACT_RATE).toBeCloseTo(1 / 28, 12);
  });

  it("excludes off-schedule rows from the audit history", () => {
    const history = buildHistory(70);
    history.push({ date: "2026-01-04", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] });
    const result = analyzeDgaAutoSuppLearningAudit(history, { activeWindowSize: 13 });

    expect(result.validHistoryDraws).toBe(70);
    expect(result.excludedHistoryRows).toBeGreaterThanOrEqual(1);
  });
});
