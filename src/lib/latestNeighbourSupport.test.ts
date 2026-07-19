import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeLatestNeighbourSupport,
  candidateSatisfiesLatestNeighbourSupport,
  type LatestNeighbourMonthlyBucketSets,
} from "./latestNeighbourSupport";

const draw = (date: string, main: number[], supp: number[] = [44, 45]): Draw => ({ date, main, supp });

const emptyBuckets = (): LatestNeighbourMonthlyBucketSets => ({
  undrawn: new Set<number>(),
  times1: new Set<number>(),
  times2: new Set<number>(),
  times3: new Set<number>(),
  times4: new Set<number>(),
  times5: new Set<number>(),
  times6: new Set<number>(),
  times7: new Set<number>(),
  times8: new Set<number>(),
});

describe("latestNeighbourSupport", () => {
  it("builds eligible +/-1 targets from the latest real draw and checks candidates", () => {
    const history = [
      draw("2026-06-01", [4, 8, 12, 16, 20, 24]),
      draw("2026-06-03", [5, 9, 13, 17, 21, 25]),
    ];

    const analysis = analyzeLatestNeighbourSupport(history, emptyBuckets(), { enabled: true });

    expect(analysis.active).toBe(true);
    expect(analysis.latestDrawDate).toBe("2026-06-03");
    expect(analysis.targetNumbers).toContain(4);
    expect(analysis.targetNumbers).toContain(6);
    expect(analysis.targetNumbers).toContain(20);
    expect(candidateSatisfiesLatestNeighbourSupport([1, 2, 3, 4, 30, 31, 32, 33], analysis)).toBe(true);
    expect(candidateSatisfiesLatestNeighbourSupport([1, 2, 3, 7, 30, 31, 32, 33], analysis)).toBe(false);
  });

  it("disqualifies a latest +/-1 target with an excessive recent consecutive hit streak", () => {
    const history = [
      draw("2026-06-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-03", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-05", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-08", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-10", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-12", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-15", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-17", [21, 2, 3, 4, 5, 6]),
      draw("2026-06-19", [20, 21, 30, 31, 32, 33]),
    ];

    const analysis = analyzeLatestNeighbourSupport(history, emptyBuckets(), {
      enabled: true,
      recentWindow: 10,
      maxRecentConsecutiveHits: 7,
    });

    expect(analysis.targetNumbers).not.toContain(21);
    expect(analysis.disqualified.find((item) => item.number === 21)?.reason).toMatch(/consecutive/);
  });

  it("disqualifies drought-heavy targets when their terminal digit is still clustered in undrawn", () => {
    const buckets = emptyBuckets();
    buckets.undrawn = new Set([7, 17, 27]);
    buckets.times2 = new Set([37]);
    const history = [
      draw("2026-06-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-03", [8, 9, 10, 11, 12, 13]),
      draw("2026-06-05", [14, 15, 16, 18, 19, 20]),
      draw("2026-06-08", [21, 22, 23, 24, 25, 26]),
    ];

    const analysis = analyzeLatestNeighbourSupport(history, buckets, {
      enabled: true,
      droughtDisqualifyThreshold: 2,
      planningLastDrawOverride: false,
    });

    expect(analysis.targetNumbers).not.toContain(27);
    expect(analysis.disqualified.find((item) => item.number === 27)?.reason).toMatch(/terminal 7/);
  });

  it("relaxes the terminal drought veto when the next draw is treated as the last draw of the month", () => {
    const buckets = emptyBuckets();
    buckets.undrawn = new Set([7, 17, 27]);
    const history = [
      draw("2026-06-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-03", [8, 9, 10, 11, 12, 13]),
      draw("2026-06-05", [14, 15, 16, 18, 19, 20]),
      draw("2026-06-08", [21, 22, 23, 24, 25, 26]),
    ];

    const analysis = analyzeLatestNeighbourSupport(history, buckets, {
      enabled: true,
      droughtDisqualifyThreshold: 2,
      planningLastDrawOverride: true,
    });

    expect(analysis.targetNumbers).toContain(27);
    expect(analysis.isPlanningLastDraw).toBe(true);
  });
});
