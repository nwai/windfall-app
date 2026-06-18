import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthEndCarryOver,
  buildEffectiveMonthEndCarryOverWeights,
  buildMonthEndCarryOverWeighting,
  SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR,
  scoreMonthEndCarryOverCandidate,
} from "./monthEndCarryOver";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});
const allNumbers = Array.from({ length: 45 }, (_, index) => index + 1);

const coveredMonth = (monthLabel: string, omitted: number[], firstDrawStartsWith: number[] = []): Draw[] => {
  const omittedSet = new Set(omitted);
  const allowed = allNumbers.filter((number) => !omittedSet.has(number));
  const startsWith = firstDrawStartsWith.filter((number) => allowed.includes(number));
  const ordered = [...startsWith, ...allowed.filter((number) => !startsWith.includes(number))];

  const draws: Draw[] = [];
  for (let index = 0; index < ordered.length; index += 6) {
    const day = String(1 + draws.length * 3).padStart(2, "0");
    draws.push(draw(`${monthLabel}-${day}`, ordered.slice(index, index + 6)));
  }
  return draws;
};

describe("analyzeMonthEndCarryOver", () => {
  it("returns an explanatory empty analysis when there are fewer than two months", () => {
    const analysis = analyzeMonthEndCarryOver([
      draw("2026-05-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-05-08", [9, 10, 11, 12, 13, 14], [15, 16]),
    ], { includeSupp: true, earlyDrawLimit: 2 });

    expect(analysis.summary.transitions).toBe(0);
    expect(analysis.notes[0]).toContain("Need at least two complete months");
    expect(analysis.topEarlyHitNumbers).toEqual([]);
  });

  it("measures how often month-end undrawn numbers are drawn in the first draws of the next month", () => {
    const history: Draw[] = [
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-02-03", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-02-10", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2026-03-05", [33, 34, 35, 36, 37, 38], [39, 40]),
      draw("2026-03-12", [41, 42, 43, 44, 45, 1], [2, 3]),
    ];

    const analysis = analyzeMonthEndCarryOver(history, { includeSupp: true, earlyDrawLimit: 1, topNumbers: 5 });

    expect(analysis.summary.transitions).toBe(2);
    expect(analysis.summary.totalMonthEndUndrawnInstances).toBe(58);
    expect(analysis.summary.earlyHitCount).toBe(16);
    expect(analysis.summary.earlyHitRate).toBeCloseTo(16 / 58, 8);
    expect(analysis.summary.baselineHitRate).toBeCloseTo(8 / 45, 8);
    expect(analysis.summary.lift).toBeGreaterThan(1.5);
    expect(analysis.timing).toHaveLength(1);
    expect(analysis.timing[0]).toMatchObject({ drawOffset: 1, hitCount: 16 });
    expect(analysis.topEarlyHitNumbers[0].number).toBe(17);
  });

  it("ignores simulated fallback rows instead of treating them as month-end carry-over evidence", () => {
    const realHistory: Draw[] = [
      draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-02-03", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-02-10", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2026-03-05", [33, 34, 35, 36, 37, 38], [39, 40]),
      draw("2026-03-12", [41, 42, 43, 44, 45, 1], [2, 3]),
    ];
    const contaminatedHistory = [
      ...realHistory,
      draw("2026-04-01", [1, 2, 3, 4, 5, 6], [7, 8], true),
    ];

    const clean = analyzeMonthEndCarryOver(realHistory, { includeSupp: true, earlyDrawLimit: 1, topNumbers: 5 });
    const contaminated = analyzeMonthEndCarryOver(contaminatedHistory, { includeSupp: true, earlyDrawLimit: 1, topNumbers: 5 });
    const weighting = buildMonthEndCarryOverWeighting(contaminatedHistory, {
      includeSupp: true,
      referenceDate: new Date("2026-03-15T00:00:00Z"),
    });

    expect(contaminated.notes).toContain(
      "Ignored 1 simulated fallback draw row; month-end carry-over diagnostics use real historical draws only.",
    );
    expect(contaminated.summary).toEqual(clean.summary);
    expect(weighting.notes).toContain(
      "Ignored 1 simulated fallback draw row; month-end carry-over weighting calculations use real historical draws only.",
    );
  });

  it("reflects supplementary inclusion in early-next-month hit rates", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [45, 44]),
      draw("2026-01-10", [7, 8, 9, 10, 11, 12], [43, 42]),
      draw("2026-02-02", [13, 14, 15, 16, 17, 45], [41, 40]),
      draw("2026-02-09", [18, 19, 20, 21, 22, 23], [39, 38]),
    ];

    const mainsOnly = analyzeMonthEndCarryOver(history, { includeSupp: false, earlyDrawLimit: 1, topNumbers: 10 });
    const mainsAndSupps = analyzeMonthEndCarryOver(history, { includeSupp: true, earlyDrawLimit: 1, topNumbers: 10 });
    const mainsOnly45 = mainsOnly.numberStats.find((item) => item.number === 45);
    const mainsAndSupps45 = mainsAndSupps.numberStats.find((item) => item.number === 45);

    expect(mainsOnly45?.earlyHitRate ?? 0).toBeGreaterThan(0.9);
    expect(mainsAndSupps45).toBeUndefined();
  });

  it("ranks early flips by support-adjusted probability instead of one-off raw hit rates", () => {
    const history: Draw[] = [
      ...coveredMonth("2026-01", [45]),
      ...coveredMonth("2026-02", [], [45]),
      ...coveredMonth("2026-03", [45]),
      ...coveredMonth("2026-04", [], [45]),
      ...coveredMonth("2026-05", [45]),
      ...coveredMonth("2026-06", [], [45]),
      ...coveredMonth("2026-07", [45]),
      ...coveredMonth("2026-08", [], [45]),
      ...coveredMonth("2026-09", [44, 45]),
      ...coveredMonth("2026-10", [], [44]),
    ];

    const analysis = analyzeMonthEndCarryOver(history, { includeSupp: false, earlyDrawLimit: 1, topNumbers: 2 });
    const oneOff = analysis.numberStats.find((item) => item.number === 44);
    const repeated = analysis.numberStats.find((item) => item.number === 45);

    expect(oneOff).toMatchObject({ monthEndsUndrawn: 1, earlyNextMonthHits: 1 });
    expect(repeated).toMatchObject({ monthEndsUndrawn: 5, earlyNextMonthHits: 4 });
    expect(oneOff?.earlyHitRate ?? 0).toBeGreaterThan(repeated?.earlyHitRate ?? 0);
    expect(analysis.topEarlyHitNumbers[0].number).toBe(45);
  });

  it("skips non-consecutive month gaps instead of treating them as carry-over transitions", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-03-02", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-03-09", [25, 26, 27, 28, 29, 30], [31, 32]),
    ];

    const analysis = analyzeMonthEndCarryOver(history, { includeSupp: true, earlyDrawLimit: 2 });

    expect(analysis.summary.transitions).toBe(0);
    expect(analysis.summary.totalMonthEndUndrawnInstances).toBe(0);
    expect(analysis.notes.some((note) => note.includes("Skipped 1 non-consecutive month transition"))).toBe(true);
  });

  it("excludes the opening partial month from history-wide carry-over averages", () => {
    const history: Draw[] = [
      draw("2024-05-10", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-05-17", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2024-06-03", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2024-06-10", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2024-07-01", [33, 34, 35, 36, 37, 38], [39, 40]),
      draw("2024-07-08", [41, 42, 43, 44, 45, 1], [2, 3]),
    ];

    const analysis = analyzeMonthEndCarryOver(history, { includeSupp: true, earlyDrawLimit: 1, topNumbers: 5 });

    expect(analysis.summary.transitions).toBe(1);
    expect(analysis.summary.totalMonthEndUndrawnInstances).toBe(29);
    expect(analysis.summary.earlyHitCount).toBe(8);
    expect(analysis.notes.some((note) => note.includes("Excluded 1 opening partial-month transition"))).toBe(true);
  });

  it("defaults on during the first three draws of the planning month and only keeps still-undrawn carry-over numbers active", () => {
    const history: Draw[] = [
      draw("2025-11-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2025-11-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2025-12-02", [44, 17, 18, 19, 20, 21], [22, 23]),
      draw("2025-12-09", [24, 25, 26, 27, 28, 29], [30, 31]),
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-02-03", [45, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-02-10", [24, 25, 26, 27, 28, 29], [30, 31]),
    ];

    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    expect(weighting.targetMonthLabel).toBe("2026-02");
    expect(weighting.sourceMonthLabel).toBe("2026-01");
    expect(weighting.drawsSoFarThisMonth).toBe(2);
    expect(weighting.defaultEnabled).toBe(true);
    expect(weighting.activeNumbers).toContain(44);
    expect(weighting.activeNumbers).not.toContain(45);
    expect(weighting.weightedNumbers.find((item) => item.number === 44)?.factor ?? 0).toBeGreaterThan(1);
  });

  it("adds last-draw to first-draw month-boundary repeats to the active carry-over pool", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 44], [15, 16]),
      draw("2026-02-03", [44, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-02-10", [24, 25, 26, 27, 28, 29], [30, 45]),
    ];

    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    expect(weighting.monthEndUndrawnNumbers).toContain(14);
    expect(weighting.monthEndUndrawnNumbers).not.toContain(44);
    expect(weighting.boundaryRepeatNumbers).toEqual([44]);
    expect(weighting.activeNumbers).toContain(14);
    expect(weighting.activeNumbers).toContain(44);
    expect(weighting.weightedNumbers.find((item) => item.number === 44)?.factor ?? 0).toBeGreaterThan(1);
    expect(weighting.notes.some((note) => note.includes("Last-draw → first-draw carry-over numbers stay in the active pool"))).toBe(true);
  });

  it("defaults off once the first three draws of the planning month have already occurred", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-02-03", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-02-10", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2026-02-17", [33, 34, 35, 36, 37, 38], [39, 40]),
    ];

    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-20T00:00:00Z"),
    });

    expect(weighting.drawsSoFarThisMonth).toBe(3);
    expect(weighting.defaultEnabled).toBe(false);
  });

  it("defaults off during the early month when active carry-over weights have no positive signal", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 44], [15, 16]),
      draw("2026-02-03", [44, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-02-10", [24, 25, 26, 27, 28, 29], [30, 45]),
    ];

    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      factorMax: 1,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    expect(weighting.drawsSoFarThisMonth).toBe(2);
    expect(weighting.activeNumbers.length).toBeGreaterThan(0);
    expect(weighting.weightedNumbers.every((item) => item.factor <= 1)).toBe(true);
    expect(weighting.defaultEnabled).toBe(false);
  });

  it("can exclude last-draw to first-draw boundary repeats from active carry-over weighting", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 44], [15, 16]),
      draw("2026-02-03", [44, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-02-10", [24, 25, 26, 27, 28, 29], [30, 45]),
    ];

    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      includeBoundaryRepeats: false,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    expect(weighting.boundaryRepeatNumbers).toEqual([]);
    expect(weighting.activeNumbers).not.toContain(44);
  });

  it("can scale carry-over influence toward neutral without changing the evidence direction", () => {
    const history: Draw[] = [
      draw("2025-11-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2025-11-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2025-12-02", [44, 17, 18, 19, 20, 21], [22, 23]),
      draw("2025-12-09", [24, 25, 26, 27, 28, 29], [30, 31]),
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-02-03", [45, 17, 18, 19, 20, 21], [22, 23]),
      draw("2026-02-10", [24, 25, 26, 27, 28, 29], [30, 31]),
    ];

    const normal = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });
    const light = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      factorScale: 0.5,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    const normalFactor = normal.weightedNumbers.find((item) => item.number === 44)?.factor ?? 1;
    const lightFactor = light.weightedNumbers.find((item) => item.number === 44)?.factor ?? 1;

    expect(normalFactor).toBeGreaterThan(1);
    expect(lightFactor).toBeGreaterThan(1);
    expect(lightFactor - 1).toBeCloseTo((normalFactor - 1) * 0.5, 8);
  });

  it("scores candidates above or below neutral depending on their carry-over mix", () => {
    const weights = { 1: 2, 2: 0.75 } as Record<number, number>;

    expect(scoreMonthEndCarryOverCandidate([1, 3, 4, 5], weights)).toMatchObject({
      hits: 1,
      delta: 1,
    });
    expect(scoreMonthEndCarryOverCandidate([1, 3, 4, 5], weights).normalizedScore).toBeGreaterThan(0.5);
    expect(scoreMonthEndCarryOverCandidate([2, 3, 4, 5], weights).normalizedScore).toBeLessThan(0.5);
    expect(scoreMonthEndCarryOverCandidate([3, 4, 5, 6], undefined).normalizedScore).toBe(0.5);
  });

  it("applies a massive explicit boost to selected carry-over numbers", () => {
    const effective = buildEffectiveMonthEndCarryOverWeights(
      { 7: 1.5, 8: 0.75 },
      [7, 7, 8, 99, -1, Number.NaN],
    );

    expect(effective?.[7]).toBe(1.5 * SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR);
    expect(effective?.[8]).toBe(SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR);
    expect(effective?.[99]).toBeUndefined();
    expect(effective?.[-1]).toBeUndefined();
    expect(effective?.[Number.NaN]).toBeUndefined();
  });
});
