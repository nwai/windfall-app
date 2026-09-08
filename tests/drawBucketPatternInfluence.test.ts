import { describe, expect, it } from "vitest";

import {
  buildDrawBucketPatternDigitBoosts,
  formatDrawBucketPatternInfluenceTrace,
  type DrawBucketPatternGenerationInfluenceRow,
} from "../src/lib/drawBucketPatternInfluence";

const row = (
  key: string,
  label: string,
  numbers: number[],
  recentAverageHits: number,
): DrawBucketPatternGenerationInfluenceRow => ({
  key,
  label,
  numbers,
  recentAverageHits,
});

describe("draw bucket pattern generation influence", () => {
  it("maps terminal-digit leaderboard rows into soft single/two-digit boosts", () => {
    const result = buildDrawBucketPatternDigitBoosts([
      row("end1", "Ending in 1", [1, 11, 21, 31, 41], 1.75),
      row("end0", "Ending in 0", [10, 20, 30, 40], 0.5),
      row("end8", "Ending in 8", [8, 18, 28, 38], 9),
    ], true);

    expect(result.boostsByDigit[1]).toEqual({ singleDigit: 1.75, twoDigit: 1.75 });
    expect(result.boostsByDigit[0]).toEqual({ singleDigit: 0, twoDigit: 0.5 });
    expect(result.boostsByDigit[8]).toEqual({ singleDigit: 5, twoDigit: 5 });
    expect(result.appliedRows.map((applied) => applied.key)).toEqual(["end1", "end0", "end8"]);
  });

  it("skips non-terminal rows and rows with no positive recent average", () => {
    const result = buildDrawBucketPatternDigitBoosts([
      row("mixed", "Mixed bucket", [1, 12, 23], 2),
      row("cold", "Cold bucket", [4, 14, 24, 34, 44], 0),
    ], true);

    expect(result.boostsByDigit).toEqual({});
    expect(result.appliedRows).toHaveLength(0);
    expect(result.skippedRows.map((skipped) => skipped.key)).toEqual(["mixed", "cold"]);
  });

  it("formats a transparent trace line for active generation influence", () => {
    const result = buildDrawBucketPatternDigitBoosts([
      row("end4", "Ending in 4", [4, 14, 24, 34, 44], 1.5),
      row("end2", "Ending in 2", [2, 12, 22, 32, 42], 1.25),
    ], true);

    expect(formatDrawBucketPatternInfluenceTrace(result, 24)).toContain(
      "[TRACE] Draw Bucket Patterns influence ON: Recent avg (24) is used as a soft terminal-digit boost",
    );
    expect(formatDrawBucketPatternInfluenceTrace(result, 24)).toContain("Ending in 4 +1.50");
  });

  it("returns no boosts when the influence is disabled", () => {
    const result = buildDrawBucketPatternDigitBoosts([
      row("end4", "Ending in 4", [4, 14, 24, 34, 44], 1.5),
    ], false);

    expect(result.boostsByDigit).toEqual({});
    expect(formatDrawBucketPatternInfluenceTrace(result, 24)).toBeNull();
  });
});
