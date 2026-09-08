import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeDroughtShortlistSourceReplay } from "./droughtShortlistSourceReplay";

const draw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });

describe("drought shortlist source replay", () => {
  it("classifies strict-only, empirical-only, and overlapping hits without lookahead", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-03", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-05", [1, 9, 17, 18, 19, 20], [21, 22]),
      draw("2026-01-07", [2, 10, 17, 23, 24, 25], [26, 27]),
    ];
    const strictTrainingLengths: number[] = [];
    const empiricalTrainingLengths: number[] = [];

    const result = analyzeDroughtShortlistSourceReplay(history, {
      minHistory: 2,
      topK: 3,
      strictShortlistBuilder: (trainingHistory) => {
        strictTrainingLengths.push(trainingHistory.length);
        return trainingHistory.length === 2 ? [1, 2, 3] : [2, 10, 30];
      },
      empiricalShortlistBuilder: (trainingHistory) => {
        empiricalTrainingLengths.push(trainingHistory.length);
        return trainingHistory.length === 2 ? [1, 9, 10] : [10, 17, 40];
      },
    });

    expect(strictTrainingLengths).toEqual([2, 3]);
    expect(empiricalTrainingLengths).toEqual([2, 3]);
    expect(result.eligibleTrials).toBe(2);
    expect(result.sourceRows.map((row) => [row.key, row.count])).toEqual([
      ["strict-only", 1],
      ["empirical-only", 2],
      ["both", 2],
    ]);
    expect(result.averageUnionHits).toBe(2.5);
    expect(result.latestRows.map((row) => row.targetDate)).toEqual(["2026-01-07", "2026-01-05"]);
    expect(result.latestRows[0].strictOnlyHits.map((hit) => hit.number)).toEqual([2]);
    expect(result.latestRows[0].empiricalOnlyHits.map((hit) => hit.number)).toEqual([17]);
    expect(result.latestRows[0].overlappingHits.map((hit) => hit.number)).toEqual([10]);
  });

  it("reports insufficient replay rows when the selected scope is too small", () => {
    const result = analyzeDroughtShortlistSourceReplay([
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-03", [9, 10, 11, 12, 13, 14], [15, 16]),
    ]);

    expect(result.sourceDraws).toBe(2);
    expect(result.eligibleTrials).toBe(0);
    expect(result.sourceRows.every((row) => row.count === 0)).toBe(true);
    expect(result.exclusiveSplitPValue).toBeNull();
  });
});
