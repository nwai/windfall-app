import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzePreviousNeighbourCountShapeAtlas } from "./previousNeighbourCountShapeAtlas";
import {
  buildPreviousNeighbourAtlasEvidence,
  matchNumbersToPreviousNeighbourAtlas,
  normalizePreviousNeighbourAtlasEvidence,
} from "./previousNeighbourAtlasEvidence";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("previousNeighbourAtlasEvidence", () => {
  it("publishes one serializable observe-only snapshot with directional ambiguity and stage provenance", () => {
    const analysis = analyzePreviousNeighbourCountShapeAtlas([
      draw("1/2/26", [1, 5, 10, 12, 20, 30], [40, 45]),
      draw("1/5/26", [2, 6, 9, 11, 19, 31], [39, 44]),
      draw("1/7/26", [10, 12, 20, 24, 32, 40], [5, 45]),
    ]);
    const snapshot = buildPreviousNeighbourAtlasEvidence(analysis, {
      historySource: "baseline",
      historySourceLabel: "Baseline excluding partial opening month",
      targetDate: "1/9/26",
      targetDrawOrdinal: 4,
      targetMonthExpectedDrawCount: 13,
    });

    expect(snapshot.observeOnly).toBe(true);
    expect(snapshot.historySource).toBe("baseline");
    expect(snapshot.targetDrawOrdinal).toBe(4);
    expect(snapshot.targetMonthExpectedDrawCount).toBe(13);
    expect(snapshot.ordinalEvidence).toBeNull();
    expect(snapshot.currentCloud?.targetNumbers).toContain(11);
    expect(snapshot.currentCloud?.numbers.find((row) => row.number === 11)).toEqual({
      number: 11,
      directions: ["-1", "+1"],
      ambiguous: true,
    });

    expect(normalizePreviousNeighbourAtlasEvidence(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("carries field coverage into a matching draw-stage snapshot", () => {
    const analysis = analyzePreviousNeighbourCountShapeAtlas([
      draw("1/2/26", [1, 5, 10, 12, 20, 30], [40, 45]),
      draw("1/5/26", [2, 6, 9, 11, 19, 31], [39, 44]),
      draw("1/7/26", [10, 12, 20, 24, 32, 40], [5, 45]),
    ]);
    const snapshot = buildPreviousNeighbourAtlasEvidence(analysis, {
      historySource: "baseline",
      historySourceLabel: "Baseline history",
      targetDrawOrdinal: 2,
    });

    expect(snapshot.ordinalEvidence?.averageTargetCount).toBeGreaterThan(0);
    expect(snapshot.ordinalEvidence?.averageFieldCoverage).toBeCloseTo(
      (snapshot.ordinalEvidence?.averageTargetCount ?? 0) / 45,
    );
    expect(normalizePreviousNeighbourAtlasEvidence(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("matches unique candidate numbers against the shared cloud without double-counting ambiguous targets", () => {
    const analysis = analyzePreviousNeighbourCountShapeAtlas([
      draw("1/2/26", [1, 5, 10, 12, 20, 30], [40, 45]),
      draw("1/5/26", [2, 6, 9, 11, 19, 31], [39, 44]),
      draw("1/7/26", [10, 12, 20, 24, 32, 40], [5, 45]),
    ]);
    const snapshot = buildPreviousNeighbourAtlasEvidence(analysis, {
      historySource: "baseline",
      historySourceLabel: "Baseline history",
      targetDrawOrdinal: 4,
    });

    const match = matchNumbersToPreviousNeighbourAtlas([11, 11, 13, 45, 99], snapshot);

    expect(match.matchedNumbers).toEqual([11, 13]);
    expect(match.ambiguousNumbers).toEqual([11]);
    expect(match.directionalCounts).toEqual({ "-2": 0, "-1": 1, "+1": 2, "+2": 0 });
    expect(match.directionalPattern).toBe("-2:0 -1:1 +1:2 +2:0");
  });
});
