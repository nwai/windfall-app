import { describe, expect, it } from "vitest";
import { ogaPercentileToSimilarity } from "./ogaQuality";

describe("ogaPercentileToSimilarity", () => {
  it("treats lower OGA percentiles as stronger historical-spoke similarity", () => {
    expect(ogaPercentileToSimilarity(0)).toBe(1);
    expect(ogaPercentileToSimilarity(25)).toBe(0.75);
    expect(ogaPercentileToSimilarity(100)).toBe(0);
  });

  it("clamps invalid percentile inputs", () => {
    expect(ogaPercentileToSimilarity(-10)).toBe(1);
    expect(ogaPercentileToSimilarity(125)).toBe(0);
    expect(ogaPercentileToSimilarity(Number.NaN)).toBe(0);
  });
});
