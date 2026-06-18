import { describe, expect, it } from "vitest";

import type { CandidateSet, Draw } from "../types";
import {
  allocatePreviousNeighbourShapeQuotas,
  annotateCandidateWithPreviousNeighbourShape,
  applyPreviousNeighbourShapeQuotas,
  buildPreviousNeighbourShapeProfile,
} from "./previousNeighbourShapeGuard";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("previousNeighbourShapeGuard", () => {
  it("classifies total, duplicated, and singleton previous-draw ±1 neighbour hits", () => {
    const previous = [11, 33, 37, 15, 31, 1, 20, 35];
    const candidate = [20, 5, 34, 22, 13, 14, 12, 29];

    const profile = buildPreviousNeighbourShapeProfile(previous, candidate);

    expect(profile.totalHits).toBe(3);
    expect(profile.duplicateHits).toBe(1);
    expect(profile.singletonHits).toBe(2);
    expect(profile.duplicateHitNumbers).toEqual([34]);
    expect(profile.singletonHitNumbers).toEqual([12, 14]);
    expect(profile.targetCount).toBe(12);
  });

  it("annotates candidates without changing their numbers or order", () => {
    const previous = draw("2026-06-10", [11, 33, 37, 15, 31, 1], [20, 35]);
    const candidate: CandidateSet = { main: [20, 5, 34, 22, 13, 14], supp: [12, 29] };

    const annotated = annotateCandidateWithPreviousNeighbourShape(candidate, previous);

    expect(annotated.main).toEqual(candidate.main);
    expect(annotated.supp).toEqual(candidate.supp);
    expect(annotated.previousNeighbourHits).toBe(3);
    expect(annotated.previousNeighbourDuplicateHits).toBe(1);
    expect(annotated.previousNeighbourSingletonHits).toBe(2);
  });

  it("allocates exact quota counts from empirical hit distributions", () => {
    const quotas = allocatePreviousNeighbourShapeQuotas(10, [
      { count: 0, observed: 1 },
      { count: 1, observed: 3 },
      { count: 2, observed: 6 },
    ]);

    expect(quotas).toEqual({ "0": 1, "1": 3, "2": 6 });
    expect(Object.values(quotas).reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("accepts candidates according to previous-neighbour hit quotas and reports shortfalls", () => {
    const candidates: CandidateSet[] = [
      { main: [1, 2, 3, 4, 5, 6], supp: [7, 8], previousNeighbourHits: 1 },
      { main: [9, 10, 11, 12, 13, 14], supp: [15, 16], previousNeighbourHits: 2 },
      { main: [17, 18, 19, 20, 21, 22], supp: [23, 24], previousNeighbourHits: 2 },
      { main: [25, 26, 27, 28, 29, 30], supp: [31, 32], previousNeighbourHits: 3 },
    ];

    const result = applyPreviousNeighbourShapeQuotas(candidates, 4, { "1": 1, "2": 2, "3": 1 });

    expect(result.candidates.map((candidate) => candidate.previousNeighbourHits)).toEqual([1, 2, 2, 3]);
    expect(result.acceptedCounts).toEqual({ "1": 1, "2": 2, "3": 1 });
    expect(result.shortfalls).toEqual({});

    const short = applyPreviousNeighbourShapeQuotas(candidates.slice(0, 2), 4, { "1": 1, "2": 2, "3": 1 });
    expect(short.candidates.map((candidate) => candidate.previousNeighbourHits)).toEqual([1, 2]);
    expect(short.shortfalls).toEqual({ "2": 1, "3": 1 });
  });
});
