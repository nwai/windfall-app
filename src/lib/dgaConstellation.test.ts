import { describe, expect, it } from "vitest";

import { buildDgaConstellationDiagnostic, MAX_CONSTELLATION_HORIZON, MAX_CONSTELLATION_RADIUS } from "./dgaConstellation";
import type { Draw } from "../types";

const emptyDraw = (date: string): Draw => ({ date, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] });

const buildHistory = (): Draw[] => {
  const history = Array.from({ length: 350 }, (_, index) => emptyDraw(`D${index + 1}`));
  history[342] = { date: "7/29/26", main: [43, 1, 2, 3, 4, 5], supp: [40, 6] };
  history[343] = { date: "7/31/26", main: [45, 1, 2, 3, 4, 5], supp: [6, 7] };
  history[344] = { date: "8/3/26", main: [41, 44, 19, 1, 2, 3], supp: [4, 5] };
  history[345] = { date: "8/5/26", main: [14, 42, 43, 1, 2, 3], supp: [44, 4] };
  history[346] = { date: "8/7/26", main: [16, 42, 45, 1, 2, 3], supp: [14, 18] };
  history[347] = { date: "8/10/26", main: [17, 18, 1, 2, 3, 4], supp: [5, 6] };
  history[348] = { date: "8/12/26", main: [18, 1, 2, 3, 4, 5], supp: [16, 6] };
  history[349] = { date: "8/14/26", main: [20, 1, 2, 3, 4, 5], supp: [6, 7] };
  return history;
};

describe("buildDgaConstellationDiagnostic", () => {
  it("measures the D348/N17 diagonal cross and local window", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 348,
      centerNumber: 17,
      radius: 3,
    });
    const radiusThree = diagnostic.radiusSummary;

    expect(diagnostic.centerCell).toMatchObject({
      drawNumber: 348,
      number: 17,
      role: "main",
    });
    expect(radiusThree.localWindow.hitCount).toBe(10);
    expect(radiusThree.localWindow.possibleCells).toBe(42);
    expect(radiusThree.risingDiagonal.hitCount).toBe(3);
    expect(radiusThree.fallingDiagonal.hitCount).toBe(3);
    expect(radiusThree.diagonalCross.hitCount).toBe(5);
    expect(radiusThree.diagonalCross.mainHits).toBe(3);
    expect(radiusThree.diagonalCross.suppHits).toBe(2);
    expect(diagnostic.matrixRows.at(-1)).toMatchObject({
      drawNumber: 351,
      drawDate: "Next draw (not yet recorded)",
      isFuture: true,
    });
  });

  it("captures the D346/N43 upper-number local diagonal cluster", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346,
      centerNumber: 43,
      radius: 3,
    });
    const radiusThree = diagnostic.radiusSummary;

    expect(diagnostic.centerCell).toMatchObject({
      drawNumber: 346,
      number: 43,
      role: "main",
    });
    expect(radiusThree.localWindow.hitCount).toBe(10);
    expect(radiusThree.risingDiagonal.hitCount).toBe(2);
    expect(radiusThree.fallingDiagonal.hitCount).toBe(4);
    expect(radiusThree.diagonalCross.hitCount).toBe(5);
  });

  it("uses the band horizon for lead-in, follow-through, and mapped draw width", () => {
    const narrow = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346,
      centerNumber: 23,
      forwardHorizon: 1,
      radius: 1,
    });
    const wide = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346,
      centerNumber: 23,
      forwardHorizon: 5,
      radius: 1,
    });

    expect(wide.forwardHorizon).toBe(5);
    expect(wide.radiusSummary.leadIn.possibleCells).toBeGreaterThan(narrow.radiusSummary.leadIn.possibleCells);
    expect(wide.radiusSummary.followThrough.possibleCells).toBeGreaterThan(narrow.radiusSummary.followThrough.possibleCells);
    expect(wide.matrixRows[0].drawNumber).toBe(341);
    expect(wide.matrixRows.at(-1)).toMatchObject({
      drawNumber: 351,
      isFuture: true,
    });
  });

  it("supports larger radius and horizon values, bounded by the shared limits", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346,
      centerNumber: 23,
      radius: 999,
      forwardHorizon: 999,
    });

    expect(diagnostic.radius).toBe(MAX_CONSTELLATION_RADIUS);
    expect(diagnostic.forwardHorizon).toBe(MAX_CONSTELLATION_HORIZON);
    expect(diagnostic.radiusSummary.radius).toBe(MAX_CONSTELLATION_RADIUS);
    expect(diagnostic.matrixRows[0].drawNumber).toBe(190);
    expect(diagnostic.matrixRows.every(row => row.cells.length === 45)).toBe(true);
    expect(diagnostic.matrixRows.at(-1)).toMatchObject({ drawNumber: 351, isFuture: true });
  });

  it("widens the band beyond eight draws without widening the number radius", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 325, centerNumber: 16, radius: 12, forwardHorizon: 20,
    });
    const active = diagnostic.radiusSummary;
    expect(diagnostic.radius).toBe(12);
    expect(diagnostic.forwardHorizon).toBe(20);
    expect(diagnostic.matrixRows[0].drawNumber).toBe(305);
    expect(diagnostic.matrixRows.at(-1)?.drawNumber).toBe(345);
    expect(diagnostic.matrixRows[0].cells.map(cell => cell.number)).toEqual(Array.from({ length: 25 }, (_, index) => index + 4));
    expect(active.leadIn.possibleCells).toBe(20 * 25);
    expect(active.followThrough.possibleCells).toBe(20 * 25);
  });

  it("keeps wide-window density arithmetic finite instead of overflowing combinations", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 175, centerNumber: 23, radius: MAX_CONSTELLATION_RADIUS,
    });
    const metric = diagnostic.radiusSummary.localWindow;
    expect(metric.possibleCells).toBe(313 * 45);
    expect(metric.hitCount).toBe(313 * 8);
    expect(metric.expectedHits).toBeCloseTo(313 * 8);
    expect(metric.upperTailPValue).toBeGreaterThan(0.49);
    expect(metric.upperTailPValue).toBeLessThan(0.53);
    const summary = diagnostic.radiusSummary;
    for (const value of [summary.localWindow, summary.diagonalCross, summary.leadIn, summary.followThrough]) {
      expect(Number.isFinite(value.expectedHits)).toBe(true);
      expect(value.upperTailPValue).not.toBeNaN();
      expect(value.upperTailPValue).toBeGreaterThanOrEqual(0);
      expect(value.upperTailPValue).toBeLessThanOrEqual(1);
      expect(value.cells.some(cell => cell.isFuture)).toBe(false);
    }
  });

  it("preserves the small-window binomial reference", () => {
    const metric = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346, centerNumber: 43, radius: 3,
    }).radiusSummary.diagonalCross;
    const n = metric.possibleCells, p = metric.baselineRate;
    let expectedTail = 0;
    for (let k = metric.hitCount; k <= n; k++) {
      let combinations = 1;
      for (let j = 1; j <= k; j++) combinations *= (n - j + 1) / j;
      expectedTail += combinations * p ** k * (1 - p) ** (n - k);
    }
    expect(metric.upperTailPValue).toBeCloseTo(expectedTail, 12);
  });

  it("clips wide maps at both number boundaries and excludes simulation rows", () => {
    const history = [...buildHistory(), { ...emptyDraw("simulated"), isSimulated: true }];
    for (const centerNumber of [1, 45]) {
      const diagnostic = buildDgaConstellationDiagnostic(history, {
        centerDrawNumber: 350, centerNumber, radius: MAX_CONSTELLATION_RADIUS, forwardHorizon: MAX_CONSTELLATION_HORIZON,
      });
      expect(diagnostic.drawCount).toBe(350);
      expect(diagnostic.matrixRows[0].cells.map(cell => cell.number)).toEqual(Array.from({ length: 45 }, (_, index) => index + 1));
      expect(diagnostic.matrixRows.filter(row => row.isFuture)).toHaveLength(1);
      expect(diagnostic.radiusSummary.followThrough.possibleCells).toBe(0);
    }
  });

  it("expands the time radius past 44 without extending or wrapping number rows", () => {
    const narrow = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 175, centerNumber: 16, radius: 44, forwardHorizon: 1,
    });
    const wide = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 175, centerNumber: 16, radius: 78, forwardHorizon: 1,
    });
    expect(wide.radius).toBe(78);
    expect(wide.matrixRows).toHaveLength(157);
    expect(wide.matrixRows[0].drawNumber).toBe(97);
    expect(wide.matrixRows.at(-1)?.drawNumber).toBe(253);
    expect(wide.matrixRows.every(row => row.cells.length === 45)).toBe(true);
    expect(wide.radiusSummary.localWindow.possibleCells).toBe(157 * 45);
    expect(wide.radiusSummary.diagonalCross.cells).toEqual(narrow.radiusSummary.diagonalCross.cells);
  });

  it("extends the band past 52 independently of radius", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 175, centerNumber: 16, radius: 3, forwardHorizon: 156,
    });
    expect(diagnostic.matrixRows).toHaveLength(313);
    expect(diagnostic.matrixRows[0].cells.map(cell => cell.number)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    expect(diagnostic.radiusSummary.leadIn.possibleCells).toBe(156 * 7);
    expect(diagnostic.radiusSummary.followThrough.possibleCells).toBe(156 * 7);
    expect(diagnostic.radiusSummary.localWindow.possibleCells).toBe(7 * 7);
  });

  it("has no fabricated recorded cells at large limits with empty history", () => {
    const diagnostic = buildDgaConstellationDiagnostic([], {
      centerDrawNumber: 1, centerNumber: 23, radius: 156, forwardHorizon: 156,
    });
    expect(diagnostic.drawCount).toBe(0);
    expect(diagnostic.radiusSummary.localWindow.possibleCells).toBe(0);
    expect(diagnostic.radiusSummary.leadIn.possibleCells).toBe(0);
    expect(diagnostic.radiusSummary.followThrough.possibleCells).toBe(0);
    expect(diagnostic.radiusSummary.localWindow.upperTailPValue).toBeNull();
    expect(diagnostic.matrixRows).toHaveLength(1);
    expect(diagnostic.matrixRows[0].isFuture).toBe(true);
  });
});
