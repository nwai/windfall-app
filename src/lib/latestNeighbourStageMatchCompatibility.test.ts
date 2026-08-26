import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import type { MonthlyBucketSets, MonthlyFrequencyConstraints } from "./monthlyDrawSummary";
import { buildLatestNeighbourStageMatchCompatibilityTrace } from "./latestNeighbourStageMatchCompatibility";

const draw = (date: string, main: number[], supp: number[] = [44, 45]): Draw => ({ date, main, supp });

const emptyBuckets = (): MonthlyBucketSets => ({
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

const constraints = (partial: Partial<MonthlyFrequencyConstraints> = {}): MonthlyFrequencyConstraints => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
  ...partial,
});

describe("latestNeighbourStageMatchCompatibility", () => {
  it("reports compatible when active bucket counts leave spare candidate slots", () => {
    const history = [
      draw("2026-06-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-03", [10, 20, 30, 40, 12, 22], [5, 15]),
    ];
    const buckets = emptyBuckets();
    buckets.undrawn = new Set([11, 19]);
    buckets.times1 = new Set([21]);

    const result = buildLatestNeighbourStageMatchCompatibilityTrace({
      enabled: true,
      history,
      analysisBuckets: buckets,
      compatibilityBuckets: buckets,
      counts: constraints({ undrawn: 1, times1: 1 }),
      countSourceLabel: "Stage-Match constructive counts",
    });

    expect(result.compatible).toBe("yes");
    expect(result.eligibleTargetCount).toBeGreaterThan(0);
    expect(result.traceLine).toContain("eligible +/-1");
    expect(result.traceLine).toContain("bucket coverage");
    expect(result.traceLine).toContain("compatible: yes");
  });

  it("reports incompatible when all slots are claimed by a bucket that contains no eligible targets", () => {
    const history = [
      draw("2026-06-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-03", [20, 30, 40, 12, 22, 32], [5, 15]),
    ];
    const buckets = emptyBuckets();
    buckets.times3 = new Set([1, 2, 3, 7, 8, 10, 17, 18]);
    buckets.undrawn = new Set(
      Array.from({ length: 45 }, (_, index) => index + 1).filter((number) => !buckets.times3.has(number)),
    );

    const result = buildLatestNeighbourStageMatchCompatibilityTrace({
      enabled: true,
      history,
      analysisBuckets: buckets,
      compatibilityBuckets: buckets,
      counts: constraints({ times3: 8 }),
      countSourceLabel: "MiAN post-filter counts",
    });

    expect(result.compatible).toBe("no");
    expect(result.traceLine).toContain("active counts 3x>=8");
    expect(result.traceLine).toContain("compatible: no");
  });

  it("does not emit a trace when LD support is disabled", () => {
    const result = buildLatestNeighbourStageMatchCompatibilityTrace({
      enabled: false,
      history: [draw("2026-06-03", [20, 30, 40, 12, 22, 32])],
      counts: constraints({ undrawn: 1 }),
      countSourceLabel: "Stage-Match constructive counts",
    });

    expect(result.traceLine).toBeNull();
    expect(result.compatible).toBe("unknown");
  });
});
