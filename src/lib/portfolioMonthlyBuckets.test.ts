import { describe, expect, it } from "vitest";
import type { MonthlyBucketSets } from "./monthlyDrawSummary";
import { buildPortfolioMonthlyBucketEvidence } from "./portfolioMonthlyBuckets";

const bucketSets = (entries: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => ({
  undrawn: new Set(entries.undrawn ?? []),
  times1: new Set(entries.times1 ?? []),
  times2: new Set(entries.times2 ?? []),
  times3: new Set(entries.times3 ?? []),
  times4: new Set(entries.times4 ?? []),
  times5: new Set(entries.times5 ?? []),
  times6: new Set(entries.times6 ?? []),
  times7: new Set(entries.times7 ?? []),
  times8: new Set(entries.times8 ?? []),
});

describe("buildPortfolioMonthlyBucketEvidence", () => {
  it("labels core and alternate numbers by their current monthly frequency bucket", () => {
    const evidence = buildPortfolioMonthlyBucketEvidence(
      bucketSets({
        undrawn: [1, 8],
        times1: [2, 3, 9],
        times2: [4, 5],
        times3: [6],
        times8: [7],
      }),
      [1, 2, 3, 4, 5, 6],
      [7, 8],
    );

    expect(evidence.available).toBe(true);
    expect(evidence.summary).toMatchObject({
      totalKnownNumbers: 9,
      unknownCoreCount: 0,
    });
    expect(evidence.summary?.coreBucketCounts).toEqual([
      { times: 0, label: "Undrawn", count: 1 },
      { times: 1, label: "1x", count: 2 },
      { times: 2, label: "2x", count: 2 },
      { times: 3, label: "3x", count: 1 },
    ]);
    expect(evidence.numbersByNumber.get(1)).toMatchObject({
      label: "Undrawn",
      bucketSize: 2,
    });
    expect(evidence.numbersByNumber.get(7)).toMatchObject({
      label: "8x+",
      bucketSize: 1,
    });
  });

  it("reports unavailable evidence when no monthly bucket sets are connected", () => {
    const evidence = buildPortfolioMonthlyBucketEvidence(null, [1, 2, 3, 4, 5, 6], []);

    expect(evidence.available).toBe(false);
    expect(evidence.reason).toBe("No monthly bucket data is connected.");
    expect(evidence.summary).toBeNull();
  });
});
