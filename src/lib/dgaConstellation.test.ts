import { describe, expect, it } from "vitest";

import { buildDgaConstellationDiagnostic } from "./dgaConstellation";
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
    const radiusThree = diagnostic.radiusSummaries[2];

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
  });

  it("captures the D346/N43 upper-number local diagonal cluster", () => {
    const diagnostic = buildDgaConstellationDiagnostic(buildHistory(), {
      centerDrawNumber: 346,
      centerNumber: 43,
      radius: 3,
    });
    const radiusThree = diagnostic.radiusSummaries[2];

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
});
