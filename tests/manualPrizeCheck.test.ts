import { describe, expect, it } from "vitest";

import { normalizeManualPrizeCheckNumbers } from "../src/lib/manualPrizeCheck";

describe("manual prize check number normalization", () => {
  it("preserves selection order so the last two selected values can remain supps", () => {
    expect(
      normalizeManualPrizeCheckNumbers([12, 1, 5, 2, 9, 10, 11, 8, 13]),
    ).toEqual([12, 1, 5, 2, 9, 10, 11, 8]);
  });

  it("deduplicates, excludes locked numbers, rejects invalid values, and keeps order", () => {
    expect(
      normalizeManualPrizeCheckNumbers([44, "3", 44, 0, 46, 18, "bad", 7, 11], [18]),
    ).toEqual([44, 3, 7, 11]);
  });
});
