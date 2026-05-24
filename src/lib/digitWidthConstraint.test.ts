import { describe, expect, it } from "vitest";

import {
  clampDigitWidthPercent,
  countSingleDigitNumbers,
  countTwoDigitNumbers,
  deriveDigitWidthTargets,
} from "./digitWidthConstraint";

describe("digitWidthConstraint", () => {
  it("clamps percentage values to 5% increments between 0 and 100", () => {
    expect(clampDigitWidthPercent(-1)).toBe(0);
    expect(clampDigitWidthPercent(12)).toBe(10);
    expect(clampDigitWidthPercent(13)).toBe(15);
    expect(clampDigitWidthPercent(101)).toBe(100);
  });

  it("derives mains-only targets using floor for single-digit counts and remainder for two-digit counts", () => {
    const targets = deriveDigitWidthTargets({ enabled: true, singleDigitPercent: 25, scope: "main" });

    expect(targets.countedSlots).toBe(6);
    expect(targets.singleDigitPercent).toBe(25);
    expect(targets.twoDigitPercent).toBe(75);
    expect(targets.singleDigitCount).toBe(1);
    expect(targets.twoDigitCount).toBe(5);
  });

  it("derives main+supp targets over eight counted slots", () => {
    const targets = deriveDigitWidthTargets({ enabled: true, singleDigitPercent: 25, scope: "mainAndSupp" });

    expect(targets.countedSlots).toBe(8);
    expect(targets.singleDigitCount).toBe(2);
    expect(targets.twoDigitCount).toBe(6);
  });

  it("counts one-digit and two-digit numbers correctly", () => {
    const numbers = [1, 7, 9, 10, 11, 22, 45];
    expect(countSingleDigitNumbers(numbers)).toBe(3);
    expect(countTwoDigitNumbers(numbers)).toBe(4);
  });
});
