import { describe, expect, it } from "vitest";

import {
  formatRepeatedTerminalDigitFamilyRule,
  normalizeRepeatedTerminalDigitFamilyRule,
  summarizeRepeatedTerminalDigitFamilies,
  violatesRepeatedTerminalDigitFamilyRule,
} from "./repeatedTerminalDigitFamilies";

describe("repeated terminal digit families", () => {
  it("counts terminal digit families that appear at least twice", () => {
    const mains = [33, 27, 21, 31, 26, 43];
    const supps = [30, 20];

    expect(summarizeRepeatedTerminalDigitFamilies(mains).repeatedDigits).toEqual([1, 3]);
    expect(summarizeRepeatedTerminalDigitFamilies([...mains, ...supps]).repeatedDigits).toEqual([0, 1, 3]);
  });

  it("normalizes impossible imported rules by scope", () => {
    expect(normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "main",
      mode: "exactly",
      count: 99,
    })).toEqual({
      scope: "main",
      mode: "exactly",
      count: 3,
    });

    expect(normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "mainAndSupp",
      mode: "atMost",
      count: 99,
    })).toEqual({
      scope: "mainAndSupp",
      mode: "atMost",
      count: 4,
    });
  });

  it("applies at least, exactly, and at most semantics", () => {
    const exactlyTwo = normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "main",
      mode: "exactly",
      count: 2,
    });
    const atLeastTwo = normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "main",
      mode: "atLeast",
      count: 2,
    });
    const atMostTwo = normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "main",
      mode: "atMost",
      count: 2,
    });

    expect(exactlyTwo).not.toBeNull();
    expect(atLeastTwo).not.toBeNull();
    expect(atMostTwo).not.toBeNull();
    expect(violatesRepeatedTerminalDigitFamilyRule(2, exactlyTwo!)).toBe(false);
    expect(violatesRepeatedTerminalDigitFamilyRule(1, exactlyTwo!)).toBe(true);
    expect(violatesRepeatedTerminalDigitFamilyRule(3, atLeastTwo!)).toBe(false);
    expect(violatesRepeatedTerminalDigitFamilyRule(1, atLeastTwo!)).toBe(true);
    expect(violatesRepeatedTerminalDigitFamilyRule(2, atMostTwo!)).toBe(false);
    expect(violatesRepeatedTerminalDigitFamilyRule(3, atMostTwo!)).toBe(true);
  });

  it("formats the rule in user-facing language", () => {
    const rule = normalizeRepeatedTerminalDigitFamilyRule({
      enabled: true,
      scope: "mainAndSupp",
      mode: "atLeast",
      count: 1,
    });

    expect(rule).not.toBeNull();
    expect(formatRepeatedTerminalDigitFamilyRule(rule!)).toBe("at least 1 repeated terminal digit family (mains + supps)");
  });
});
