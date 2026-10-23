import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzePreviousNeighbourCountShapeAtlas } from "./previousNeighbourCountShapeAtlas";

const draw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });

describe("previousNeighbourCountShapeAtlas", () => {
  it("keeps unique hits separate from directional paths and classifies their composition", () => {
    const history = [
      draw("1/30/26", [1, 10, 20, 30, 40, 45], [5, 15]),
      draw("2/2/26", [2, 9, 18, 31, 38, 44], [6, 16]),
      draw("2/4/26", [4, 8, 19, 29, 39, 43], [12, 17]),
    ];

    const analysis = analyzePreviousNeighbourCountShapeAtlas(history);

    expect(analysis.transitionCount).toBe(2);
    expect(analysis.transitions[0].drawOrdinal).toBe(1);
    expect(analysis.transitions[0].crossMonth).toBe(true);
    expect(analysis.transitions[0].uniqueHitCount).toBe(8);
    expect(analysis.transitions[0].hitNumbers).toEqual([2, 6, 9, 16, 18, 31, 38, 44]);
    expect(analysis.transitions[0].oddHitCount + analysis.transitions[0].evenHitCount).toBe(8);
    expect(analysis.transitions[0].oneDigitHitCount + analysis.transitions[0].twoDigitHitCount).toBe(8);
    expect(analysis.transitions[0].directionalHitTotal).toBeGreaterThanOrEqual(analysis.transitions[0].uniqueHitCount);
    expect(analysis.countDistribution.find((row) => row.count === 8)?.observed).toBe(1);
    expect(analysis.byDrawOrdinal.map((row) => row.label)).toEqual(["D1", "D2"]);
    expect(analysis.byDrawOrdinal[0].averageTargetCount).toBe(analysis.transitions[0].targetCount);
    expect(analysis.byDrawOrdinal[0].averageFieldCoverage).toBeCloseTo(analysis.transitions[0].targetCount / 45);
    const d1CloudBand = analysis.byDrawOrdinalAndCloudSize.find((row) => row.drawOrdinal === 1);
    expect(d1CloudBand).toBeDefined();
    expect(analysis.transitions[0].targetCount).toBeGreaterThanOrEqual(d1CloudBand?.bandMinimum ?? 46);
    expect(analysis.transitions[0].targetCount).toBeLessThanOrEqual(d1CloudBand?.bandMaximum ?? -1);
    expect(d1CloudBand?.averageExcessHits).toBeCloseTo(
      analysis.transitions[0].uniqueHitCount - analysis.transitions[0].expectedUniqueHits,
    );
    expect(d1CloudBand?.excessHitsCiLow).toBeNull();
    expect([
      ...(analysis.planningCloud?.singletonTargetNumbers ?? []),
      ...(analysis.planningCloud?.duplicateTargetNumbers ?? []),
    ].sort((left, right) => left - right)).toEqual(analysis.planningCloud?.targetNumbers);
    expect(analysis.parity.reduce((total, row) => total + row.observed, 0)).toBe(
      analysis.transitions.reduce((total, row) => total + row.uniqueHitCount, 0),
    );
    expect(analysis.digitWidth.reduce((total, row) => total + row.observed, 0)).toBe(
      analysis.transitions.reduce((total, row) => total + row.uniqueHitCount, 0),
    );
  });

  it("excludes baseline target months without removing their final source draw", () => {
    const history = [
      draw("12/30/25", [1, 10, 20, 30, 40, 45], [5, 15]),
      draw("1/2/26", [2, 9, 18, 31, 38, 44], [6, 16]),
      draw("1/5/26", [4, 8, 19, 29, 39, 43], [12, 17]),
      draw("2/2/26", [3, 7, 18, 28, 38, 42], [11, 16]),
    ];

    const analysis = analyzePreviousNeighbourCountShapeAtlas(history, {
      excludedTargetMonthLabels: ["2026-01"],
    });

    expect(analysis.excludedTargetDraws).toBe(2);
    expect(analysis.transitionCount).toBe(1);
    expect(analysis.transitions[0].previousDateLabel).toBe("1/5/26");
    expect(analysis.transitions[0].currentDate).toBe("2/2/26");
    expect(analysis.transitions[0].drawOrdinal).toBe(1);
    expect(analysis.transitions[0].crossMonth).toBe(true);
  });

  it("marks small ordinal groups as thin evidence", () => {
    const analysis = analyzePreviousNeighbourCountShapeAtlas([
      draw("1/2/26", [1, 10, 20, 30, 40, 45], [5, 15]),
      draw("1/5/26", [2, 9, 18, 31, 38, 44], [6, 16]),
    ]);

    expect(analysis.byDrawOrdinal[0].sampleQuality).toBe("Thin");
    expect(analysis.warnings.join(" ")).toContain("fewer than 20 tested transitions");
  });

  it("reports a draw-level excess interval when a stage and cloud band has repeated trials", () => {
    const d1 = [1, 10, 20, 30, 40, 45];
    const d1Supp = [5, 15];
    const d2 = [2, 9, 18, 31, 38, 44];
    const d2Supp = [6, 16];
    const analysis = analyzePreviousNeighbourCountShapeAtlas([
      draw("12/31/25", d2, d2Supp),
      draw("1/2/26", d1, d1Supp),
      draw("1/5/26", d2, d2Supp),
      draw("2/2/26", d1, d1Supp),
      draw("2/4/26", d2, d2Supp),
      draw("3/2/26", d1, d1Supp),
      draw("3/4/26", d2, d2Supp),
    ]);

    const repeatedD2Band = analysis.byDrawOrdinalAndCloudSize.find((row) => (
      row.drawOrdinal === 2 && row.trials === 3
    ));
    expect(repeatedD2Band).toBeDefined();
    expect(repeatedD2Band?.excessHitsCiLow).not.toBeNull();
    expect(repeatedD2Band?.excessHitsCiHigh).not.toBeNull();
    expect(Number.isFinite(repeatedD2Band?.excessHitsCiLow ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(repeatedD2Band?.excessHitsCiHigh ?? Number.NaN)).toBe(true);
  });
});
