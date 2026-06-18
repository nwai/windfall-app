import { describe, expect, it } from "vitest";
import type { CandidateSet, Draw } from "../types";
import {
  buildScoringGenerationProfile,
  scoreCandidateWithScoringProfile,
  scoringInfluenceMultiplier,
} from "./scoringGenerationInfluence";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring generation influence", () => {
  const fullHistory = [
    draw("1/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
    draw("1/3/26", [1, 11, 21, 31, 41, 2], [12, 22]),
    draw("1/5/26", [1, 11, 21, 31, 41, 3], [13, 23]),
    draw("1/7/26", [4, 14, 24, 34, 44, 5], [15, 25]),
  ];
  const filteredHistory = fullHistory.slice(-2);

  it("builds a serializable profile without probability language", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "normal",
    });

    expect(profile.enabled).toBe(true);
    expect(profile.scope).toBe("mains-plus-supps");
    expect(profile.influence).toBe("normal");
    expect(profile.numberScores[1]).toBeGreaterThan(profile.numberScores[40]);
    expect(profile.numberMultipliers[1]).toBeGreaterThan(profile.numberMultipliers[40]);
    expect(profile.traceLabel).toContain("Scoring Diagnostics");
    expect(profile.traceLabel).toContain("evidence weighting");
    expect(profile.traceLabel).not.toMatch(/predict|probability|guarantee/i);
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  });

  it("keeps off mode neutral", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "off",
    });

    expect(profile.enabled).toBe(false);
    expect(scoringInfluenceMultiplier(1, profile)).toBe(1);
    expect(scoringInfluenceMultiplier(40, profile)).toBe(1);
  });

  it("scores candidates transparently from number, ratio, and terminal-digit-set evidence", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "normal",
    });
    const candidate: CandidateSet = { main: [1, 11, 21, 31, 41, 4], supp: [14, 24] };

    const scored = scoreCandidateWithScoringProfile(candidate, profile);

    expect(scored.score).toBeGreaterThan(0);
    expect(scored.normalizedScore).toBeGreaterThan(0);
    expect(scored.normalizedScore).toBeLessThanOrEqual(1);
    expect(scored.components.number).toBeGreaterThan(0);
    expect(scored.components.ratio).toBeGreaterThan(0);
    expect(scored.components.terminalDigitSet).toBeGreaterThan(0);
    expect(scored.trace.join(" ")).toContain("diagnostic evidence");
    expect(scored.trace.join(" ")).not.toMatch(/predict|probability|guarantee/i);
  });
});
