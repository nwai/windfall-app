import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clampProbability } from "../src/components/SurvivalAnalyzer";

describe("clampProbability", () => {
  it("keeps displayed probabilities inside 0..1", () => {
    expect(clampProbability(-0.25)).toBe(0);
    expect(clampProbability(0.42)).toBe(0.42);
    expect(clampProbability(1.75)).toBe(1);
  });
});

describe("SurvivalAnalyzer custom trend split copy", () => {
  it("uses unambiguous labels and exposes the effective split", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/SurvivalAnalyzer.tsx"), "utf8");

    expect(source).toContain("Custom Trend Split");
    expect(source).toContain("Use this trend split");
    expect(source).toContain("Recent slice");
    expect(source).toContain("Most recent draws");
    expect(source).toContain("Use the most recent {customTrendSplit.mostRecentDraws} draws");
    expect(source).not.toContain(">Custom Trend Window<");
    expect(source).not.toContain("Use custom trend");
    expect(source).not.toContain(">Older <input");
    expect(source).not.toContain(">Window <input");
  });
});
