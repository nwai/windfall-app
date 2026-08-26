import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzePreviousNeighbourDirectionalPatterns,
  analyzePreviousNeighbourHandoff,
} from "./previousNeighbourDirectionalPatterns";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("previousNeighbourDirectionalPatterns", () => {
  it("builds ±1/±2 directional fingerprints without lookahead", () => {
    const history = [
      draw("6/10/26", [11, 33, 37, 15, 31, 1], [20, 35]),
      draw("6/12/26", [20, 5, 34, 22, 13, 14], [12, 29]),
      draw("6/15/26", [44, 43, 32, 34, 38, 24], [33, 40]),
    ];

    const analysis = analyzePreviousNeighbourDirectionalPatterns(history, {
      scope: "mains-plus-supps",
      lookbackDraws: 1,
    });

    expect(analysis.validDraws).toBe(3);
    expect(analysis.transitionCount).toBe(2);
    expect(analysis.latestTransition?.previousDateLabel).toBe("6/12/26");
    expect(analysis.latestTransition?.currentDate).toBe("6/15/26");
    expect(analysis.latestTransition?.pattern).toBe("-2:1 -1:1 +1:0 +2:1");
    expect(analysis.latestTransition?.uniqueHitCount).toBe(3);
    expect(analysis.latestTransition?.duplicateHitCount).toBe(0);
    expect(analysis.selectionHelper?.sourceDateLabel).toBe("6/15/26");
    expect(analysis.selectionHelper?.targetsByOffset["-2"]).toEqual([22, 30, 31, 32, 36, 38, 41, 42]);
    expect(analysis.selectionHelper?.targetsByOffset["+2"]).toEqual([26, 34, 35, 36, 40, 42, 45]);
  });

  it("can use the previous two draws as the source cloud", () => {
    const history = [
      draw("6/10/26", [11, 33, 37, 15, 31, 1], [20, 35]),
      draw("6/12/26", [20, 5, 34, 22, 13, 14], [12, 29]),
      draw("6/15/26", [44, 43, 32, 34, 38, 24], [33, 40]),
    ];

    const analysis = analyzePreviousNeighbourDirectionalPatterns(history, {
      scope: "mains-plus-supps",
      lookbackDraws: 2,
    });

    expect(analysis.transitionCount).toBe(1);
    expect(analysis.latestTransition?.previousDateLabel).toBe("6/10/26..6/12/26");
    expect(analysis.latestTransition?.currentDate).toBe("6/15/26");
    expect(analysis.latestTransition?.uniqueHitCount).toBe(5);
    expect(analysis.latestTransition?.pattern).toBe("-2:2 -1:3 +1:3 +2:2");
    expect(analysis.selectionHelper?.sourceDateLabel).toBe("6/12/26..6/15/26");
  });

  it("tests whether hit or missed neighbour targets hand off into the following draw without lookahead", () => {
    const history = [
      draw("6/10/26", [11, 33, 37, 15, 31, 1], [20, 35]),
      draw("6/12/26", [20, 5, 34, 22, 13, 14], [12, 29]),
      draw("6/15/26", [44, 43, 32, 34, 38, 24], [33, 40]),
    ];

    const analysis = analyzePreviousNeighbourHandoff(history, {
      scope: "mains-plus-supps",
      latestRows: 10,
    });

    expect(analysis.validDraws).toBe(3);
    expect(analysis.testedTriples).toBe(1);
    expect(analysis.latestRows).toHaveLength(1);
    expect(analysis.latestRows[0].previousDate).toBe("6/10/26");
    expect(analysis.latestRows[0].hitDate).toBe("6/12/26");
    expect(analysis.latestRows[0].nextDate).toBe("6/15/26");
    expect(analysis.latestRows[0].hitSourceNumbers).toEqual([12, 13, 14, 22, 29, 34]);
    expect(analysis.latestRows[0].hitSideNextHits).toEqual([24, 32, 33]);
    expect(analysis.latestRows[0].hitSourceExactRepeats).toEqual([34]);
    expect(analysis.latestRows[0].delayedMissedTargets).toEqual([32, 33, 38]);
    expect(analysis.currentMissedSideHelper?.previousDate).toBe("6/12/26");
    expect(analysis.currentMissedSideHelper?.latestDate).toBe("6/15/26");
    expect(analysis.currentMissedSideHelper?.oldNeighbourTargetCount).toBe(26);
    expect(analysis.currentMissedSideHelper?.hitSourceNumbers).toEqual([24, 32, 33]);
    expect(analysis.currentMissedSideHelper?.missedSourceNumbers).toEqual([
      3, 4, 6, 7, 10, 11, 12, 13, 14, 15, 16, 18,
      19, 20, 21, 22, 23, 27, 28, 30, 31, 35, 36,
    ]);
    expect(analysis.currentMissedSideHelper?.targetsByOffset["-2"]).toContain(1);
    expect(analysis.currentMissedSideHelper?.targetsByOffset["+2"]).toContain(38);
    expect(analysis.antiLookaheadNote).toContain("A -> B -> C");
  });
});
