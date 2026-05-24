import { describe, expect, it } from "vitest";

import { isDisplayedValueInRange, isValueInRange, roundValueForDisplay } from "./generatedCandidateFilterUtils";

describe("generatedCandidateFilterUtils", () => {
  it("rounds values with the same precision used in the table", () => {
    expect(roundValueForDisplay(38.75, 1)).toBe(38.8);
    expect(roundValueForDisplay(12.345, 2)).toBe(12.35);
  });

  it("matches exact one-decimal filters against rounded display values", () => {
    expect(isDisplayedValueInRange(38.75, 38.8, 38.8, 1)).toBe(true);
    expect(isDisplayedValueInRange(62.249, 62.2, 62.2, 1)).toBe(true);
  });

  it("matches exact two-decimal filters against rounded display values", () => {
    expect(isDisplayedValueInRange(71.995, 72, 72, 2)).toBe(true);
    expect(isDisplayedValueInRange(71.994, 72, 72, 2)).toBe(false);
  });

  it("keeps inclusive raw range comparisons for non-display-aware checks", () => {
    expect(isValueInRange(50, 50, 50)).toBe(true);
    expect(isValueInRange(49.9999999995, 50, 50)).toBe(true);
    expect(isValueInRange(49.8, 50, 50)).toBe(false);
  });

  it("treats missing values as non-matches when a range is active", () => {
    expect(isDisplayedValueInRange(null, 10, 20, 1)).toBe(false);
    expect(isDisplayedValueInRange(undefined, null, null, 1)).toBe(true);
  });
});