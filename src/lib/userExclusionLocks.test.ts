import { describe, expect, it } from "vitest";

import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
  removeUserExcludedNumbers,
} from "./userExclusionLocks";

describe("userExclusionLocks", () => {
  it("normalizes user exclusion lock numbers to valid unique 1-45 values", () => {
    expect(normalizeUserExclusionLocks([12, 1, 12, 0, 46, Number.NaN, 7])).toEqual([1, 7, 12]);
  });

  it("removes excluded numbers from conflicting selected-number lists", () => {
    expect(removeUserExcludedNumbers([7, 3, 12, 7, 45], [12, 45])).toEqual([3, 7]);
  });

  it("formats a short reminder for active exclusions", () => {
    expect(formatUserExclusionReminder([12, 7, 12])).toBe("Active exclusions: 7, 12");
    expect(formatUserExclusionReminder([12, 7, 12], "User exclusions active")).toBe("User exclusions active: 7, 12");
    expect(formatUserExclusionReminder([])).toBe("");
  });
});
