import {
  DEFAULT_GENERATED_CANDIDATE_COUNT,
  getGeneratedCandidateCountWindowDefault,
  normalizeGeneratedCandidateCount,
} from "./generatedCandidateCount";

describe("generatedCandidateCount", () => {
  it("returns the active window size when it is a positive integer", () => {
    expect(getGeneratedCandidateCountWindowDefault(3)).toBe(3);
    expect(getGeneratedCandidateCountWindowDefault(12)).toBe(12);
    expect(getGeneratedCandidateCountWindowDefault(316)).toBe(316);
  });

  it("falls back to the default when the active window size is missing or invalid", () => {
    expect(getGeneratedCandidateCountWindowDefault(0)).toBe(DEFAULT_GENERATED_CANDIDATE_COUNT);
    expect(getGeneratedCandidateCountWindowDefault(-5)).toBe(DEFAULT_GENERATED_CANDIDATE_COUNT);
    expect(getGeneratedCandidateCountWindowDefault(Number.NaN)).toBe(DEFAULT_GENERATED_CANDIDATE_COUNT);
  });

  it("normalizes manual candidate counts while preserving manual entry support", () => {
    expect(normalizeGeneratedCandidateCount(25)).toBe(25);
    expect(normalizeGeneratedCandidateCount(24.6)).toBe(25);
    expect(normalizeGeneratedCandidateCount(0)).toBe(1);
    expect(normalizeGeneratedCandidateCount("bad", 12)).toBe(12);
  });
});
