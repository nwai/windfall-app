import { describe, expect, it } from "vitest";

import { deriveMainConstraintExclusions } from "./mainConstraintExclusions";

const bucketMap = {
  main0: [10, 20, 30, 40],
  main1: [1, 11, 21, 31, 41],
  main5: [5, 15, 25, 35, 45],
  main6: [6, 16, 26, 36],
  main7: [7, 17, 27, 37],
} as const;

describe("deriveMainConstraintExclusions", () => {
  it("does not auto-exclude when enabled maxima total is 6 or less", () => {
    const result = deriveMainConstraintExclusions(
      [
        { bucketKey: "main0", enabled: true, count: 2 },
        { bucketKey: "main1", enabled: true, count: 2 },
        { bucketKey: "main5", enabled: true, count: 2 },
        { bucketKey: "main6", enabled: false, count: 0 },
      ],
      bucketMap,
      6
    );

    expect(result.shouldApply).toBe(false);
    expect(result.totalSelectedMax).toBe(6);
    expect(result.excludedBucketKeys).toEqual([]);
    expect(result.excludedNumbers).toEqual([]);
  });

  it("auto-excludes buckets that are off when enabled maxima total exceeds 6", () => {
    const result = deriveMainConstraintExclusions(
      [
        { bucketKey: "main0", enabled: true, count: 3 },
        { bucketKey: "main1", enabled: true, count: 2 },
        { bucketKey: "main5", enabled: true, count: 2 },
        { bucketKey: "main6", enabled: false, count: 4 },
      ],
      bucketMap,
      6
    );

    expect(result.shouldApply).toBe(true);
    expect(result.totalSelectedMax).toBe(7);
    expect(result.activeBucketKeys).toEqual(["main0", "main1", "main5"]);
    expect(result.excludedBucketKeys).toEqual(["main6"]);
    expect(result.excludedNumbers).toEqual([6, 16, 26, 36]);
  });

  it("auto-excludes enabled zero-count buckets as well as disabled buckets", () => {
    const result = deriveMainConstraintExclusions(
      [
        { bucketKey: "main0", enabled: true, count: 4 },
        { bucketKey: "main1", enabled: true, count: 2 },
        { bucketKey: "main5", enabled: true, count: 1 },
        { bucketKey: "main6", enabled: true, count: 0 },
      ],
      bucketMap,
      6
    );

    expect(result.shouldApply).toBe(true);
    expect(result.totalSelectedMax).toBe(7);
    expect(result.excludedBucketKeys).toEqual(["main6"]);
    expect(result.excludedNumbers).toEqual([6, 16, 26, 36]);
  });

  it("does not auto-exclude zero/off buckets that still have a positive split boost", () => {
    const result = deriveMainConstraintExclusions(
      [
        { bucketKey: "main0", enabled: true, count: 3 },
        { bucketKey: "main1", enabled: true, count: 2 },
        { bucketKey: "main5", enabled: true, count: 2 },
        { bucketKey: "main6", enabled: false, count: 0, twoDigitBoost: 3 },
        { bucketKey: "main7", enabled: false, count: 0 },
      ],
      bucketMap,
      6
    );

    expect(result.shouldApply).toBe(true);
    expect(result.excludedBucketKeys).toEqual(["main7"]);
    expect(result.excludedNumbers).toEqual([7, 17, 27, 37]);
  });

  it("treats a single-digit-only boost as sufficient to keep a bucket eligible", () => {
    const result = deriveMainConstraintExclusions(
      [
        { bucketKey: "main0", enabled: true, count: 3 },
        { bucketKey: "main1", enabled: true, count: 2 },
        { bucketKey: "main5", enabled: true, count: 2 },
        { bucketKey: "main6", enabled: false, count: 0, singleDigitBoost: 2 },
        { bucketKey: "main7", enabled: false, count: 0 },
      ],
      bucketMap,
      6
    );

    expect(result.shouldApply).toBe(true);
    expect(result.excludedBucketKeys).toEqual(["main7"]);
    expect(result.excludedNumbers).toEqual([7, 17, 27, 37]);
  });
});
