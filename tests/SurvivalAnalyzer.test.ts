import { describe, expect, it } from "vitest";
import { clampProbability } from "../src/components/SurvivalAnalyzer";

describe("clampProbability", () => {
  it("keeps displayed probabilities inside 0..1", () => {
    expect(clampProbability(-0.25)).toBe(0);
    expect(clampProbability(0.42)).toBe(0.42);
    expect(clampProbability(1.75)).toBe(1);
  });
});
