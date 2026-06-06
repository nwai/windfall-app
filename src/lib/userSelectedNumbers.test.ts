import { describe, expect, it } from "vitest";

import {
  buildAutoExcludedFromUserSelection,
  buildUserSelectionSimulation,
  normalizeUserSelectedNumbers,
  toggleUserSelectedNumber,
} from "./userSelectedNumbers";

describe("user selected number logic", () => {
  it("normalizes imported or persisted selections into unique sorted draw numbers", () => {
    expect(normalizeUserSelectedNumbers([8, "9", 8, 0, 46, 3, 1.2, " 7 ", "", true])).toEqual([3, 7, 8, 9]);
  });

  it("toggles a number without creating duplicates or unstable ordering", () => {
    expect(toggleUserSelectedNumber([8, 3], 5)).toEqual([3, 5, 8]);
    expect(toggleUserSelectedNumber([3, 5, 8], 5)).toEqual([3, 8]);
  });

  it("refuses to simulate until at least six unique valid numbers are selected", () => {
    const result = buildUserSelectionSimulation([10, 2, 1, 9, 3]);

    expect(result.ready).toBe(false);
    expect(result.numbers).toEqual([]);
    expect(result.reason).toContain("6");
  });

  it("builds deterministic simulated main and supplementary numbers from the first eight sorted selections", () => {
    const result = buildUserSelectionSimulation([9, 1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result.ready).toBe(true);
    expect(result.numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.main).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.supp).toEqual([7, 8]);
  });

  it("does not auto-exclude the whole number space when nothing is selected", () => {
    expect(buildAutoExcludedFromUserSelection([], true)).toEqual([]);
    expect(buildAutoExcludedFromUserSelection([1, 2, 45], true)).toEqual(
      Array.from({ length: 45 }, (_, index) => index + 1).filter((number) => ![1, 2, 45].includes(number)),
    );
    expect(buildAutoExcludedFromUserSelection([1, 2, 45], false)).toEqual([]);
  });
});
