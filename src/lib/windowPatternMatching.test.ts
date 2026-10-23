import { describe, expect, it } from "vitest";
import { countCandidateWindowPatternMatches, windowPatternForNumbers } from "./windowPatternMatching";

const candidate = { main: [1, 2, 3, 24, 25, 26], supp: [40, 41] };

describe("Window Stats candidate pattern matching", () => {
  it("matches captured mains-only and mains-plus-supps patterns using their own scopes", () => {
    const mains = windowPatternForNumbers(candidate.main);
    const all = windowPatternForNumbers([...candidate.main, ...candidate.supp]);
    expect(countCandidateWindowPatternMatches(candidate, [mains, all])).toBe(2);
    expect(countCandidateWindowPatternMatches({ ...candidate, supp: [42, 43] }, [mains, all])).toBe(1);
  });

  it("does not award duplicate captured patterns extra bonuses", () => {
    const pattern = windowPatternForNumbers(candidate.main);
    expect(countCandidateWindowPatternMatches(candidate, [pattern, { ...pattern }])).toBe(1);
  });

  it("uses inclusive sum tolerance without relaxing composition checks", () => {
    const pattern = windowPatternForNumbers(candidate.main);
    expect(countCandidateWindowPatternMatches(candidate, [{ ...pattern, sum: pattern.sum + 2 }], 1)).toBe(0);
    expect(countCandidateWindowPatternMatches(candidate, [{ ...pattern, sum: pattern.sum + 2 }], 2)).toBe(1);
    expect(countCandidateWindowPatternMatches(candidate, [{ ...pattern, odd: pattern.odd + 1 }], 2)).toBe(0);
  });

  it("rejects invalid scopes and handles empty sets or non-finite tolerance neutrally", () => {
    const pattern = windowPatternForNumbers(candidate.main);
    expect(countCandidateWindowPatternMatches(candidate, [])).toBe(0);
    expect(countCandidateWindowPatternMatches(candidate, [{ ...pattern, high: 9 }], 100)).toBe(0);
    expect(countCandidateWindowPatternMatches(candidate, [{ ...pattern, sum: pattern.sum + 1 }], NaN)).toBe(0);
  });
});
