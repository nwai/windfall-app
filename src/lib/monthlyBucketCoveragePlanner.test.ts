import { describe, expect, it } from "vitest";

import {
  analyzeBucketCoveragePlanner,
  buildBucketCoverageGenerationPlan,
  chooseBounded,
} from "./monthlyBucketCoveragePlanner";
import type { MonthlyBucketSets, MonthlyFrequencyConstraints } from "./monthlyDrawSummary";

const zeroCounts = (): MonthlyFrequencyConstraints => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
});

const bucketSets = (): MonthlyBucketSets => ({
  undrawn: new Set<number>(),
  times1: new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]),
  times2: new Set<number>([11, 12, 13]),
  times3: new Set<number>(),
  times4: new Set<number>(),
  times5: new Set<number>(),
  times6: new Set<number>(),
  times7: new Set<number>(),
  times8: new Set<number>(),
});

describe("monthly bucket coverage planner", () => {
  it("calculates the exact pair burden for two required numbers from eight available", () => {
    const constraints = { ...zeroCounts(), times1: 2 };
    const preview = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints,
      buckets: bucketSets(),
      requestedPoolSize: 28,
    });

    expect(chooseBounded(8, 2)).toBe(28);
    expect(preview.status).toBe("full");
    expect(preview.burden).toBe(28);
    expect(preview.rows.find((row) => row.key === "times1")).toMatchObject({
      required: 2,
      remainingRequired: 2,
      availableCount: 8,
      combinationCount: 28,
    });
  });

  it("subtracts forced bucket members before calculating remaining coverage", () => {
    const constraints = { ...zeroCounts(), times1: 2 };
    const preview = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints,
      buckets: bucketSets(),
      forcedNumbers: [1],
      requestedPoolSize: 7,
    });

    expect(preview.status).toBe("full");
    expect(preview.burden).toBe(7);
    expect(preview.rows.find((row) => row.key === "times1")).toMatchObject({
      forcedCount: 1,
      remainingRequired: 1,
      availableCount: 7,
      combinationCount: 7,
    });
  });

  it("blocks impossible or oversized coverage spaces honestly", () => {
    const impossible = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints: { ...zeroCounts(), times2: 4 },
      buckets: bucketSets(),
      requestedPoolSize: 100,
    });
    expect(impossible.status).toBe("impossible");
    expect(impossible.canGenerate).toBe(false);

    const tooLargeBuckets = bucketSets();
    tooLargeBuckets.undrawn = new Set(Array.from({ length: 25 }, (_, index) => index + 1));
    tooLargeBuckets.times1 = new Set(Array.from({ length: 20 }, (_, index) => index + 26));
    const tooLarge = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints: { ...zeroCounts(), undrawn: 4, times1: 4 },
      buckets: tooLargeBuckets,
      requestedPoolSize: 1000,
      maxFullCoverage: 100,
      maxSampledCoverage: 1000,
    });
    expect(tooLarge.status).toBe("too-large");
    expect(tooLarge.canGenerate).toBe(false);
  });

  it("can leave the undrawn bucket out of coverage math while still reporting it as required", () => {
    const buckets = bucketSets();
    buckets.undrawn = new Set(Array.from({ length: 25 }, (_, index) => index + 1));
    const preview = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints: { ...zeroCounts(), undrawn: 4, times1: 2 },
      buckets,
      ignoredBucketKeys: ["undrawn"],
      requestedPoolSize: 28,
      maxFullCoverage: 100,
      maxSampledCoverage: 1000,
    });

    expect(preview.status).toBe("full");
    expect(preview.burden).toBe(28);
    expect(preview.requiredTotal).toBe(6);
    expect(preview.plannedRequiredTotal).toBe(2);
    expect(preview.rows.find((row) => row.key === "undrawn")).toMatchObject({
      required: 4,
      remainingRequired: 4,
      ignoredForCoverage: true,
    });
    expect(preview.reasons.join(" ")).toContain("standard random constructive fill");
  });

  it("builds full coverage plans that cycle all requested bucket combinations", () => {
    const preview = analyzeBucketCoveragePlanner({
      enabled: true,
      constraints: { ...zeroCounts(), times1: 2 },
      buckets: bucketSets(),
      requestedPoolSize: 28,
    });
    const plan = buildBucketCoverageGenerationPlan(preview, () => 0);

    expect(plan).not.toBeNull();
    const signatures = new Set<string>();
    for (let attempt = 0; attempt < 28; attempt += 1) {
      signatures.add(plan!.next(attempt).times1!.join(","));
    }
    expect(signatures.size).toBe(28);
  });
});
