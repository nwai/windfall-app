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
    expect(profile.traceLabel).toContain("Numbers diagnostic");
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

  it("scores candidates transparently from Numbers evidence only", () => {
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
    expect(scored.components).toEqual({ number: scored.score });
    expect(scored.score).toBeCloseTo([...candidate.main, ...candidate.supp]
      .reduce((sum, number) => sum + profile.numberScores[number], 0) / 8, 3);
    expect(profile).not.toHaveProperty("ratioScores");
    expect(profile).not.toHaveProperty("terminalDigitSetScores");
    expect(scored.trace.join(" ")).toContain("diagnostic evidence");
    expect(scored.trace.join(" ")).not.toMatch(/predict|probability|guarantee/i);
  });

  it("ignores legacy ratio and terminal maps even when their values are enormous", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, { influence: "normal" });
    const candidate: CandidateSet = { main: [1, 11, 21, 31, 41, 4], supp: [14, 24] };
    const legacyProfile = { ...profile, ratioScores: { "5:3": 1e9 },
      terminalDigitSetScores: { "1,4": 1e9 }, straightRunScores: { "1,4": 1e9 } };
    expect(scoreCandidateWithScoringProfile(candidate, legacyProfile))
      .toEqual(scoreCandidateWithScoringProfile(candidate, profile));
  });

  it("does not prefer a ratio or terminal pattern when mean Numbers scores are tied", () => {
    const profile = { ...buildScoringGenerationProfile(fullHistory, filteredHistory, { influence: "normal" }),
      numberScores: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, 10])) };
    const candidates: CandidateSet[] = [
      { main: [1, 11, 21, 31, 41, 3], supp: [13, 23] },
      { main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
    ];
    expect(candidates.map((candidate) => scoreCandidateWithScoringProfile(candidate, profile).normalizedScore))
      .toEqual([1, 1]);
  });

  it("honors mains-only scope and keeps disabled candidate evidence neutral", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, { scope: "mains", influence: "normal" });
    const candidate: CandidateSet = { main: [1, 11, 21, 31, 41, 4], supp: [14, 24] };
    const changed = { ...candidate, supp: [39, 40] };
    expect(scoreCandidateWithScoringProfile(candidate, profile)).toEqual(scoreCandidateWithScoringProfile(changed, profile));
    expect(scoreCandidateWithScoringProfile(candidate, { ...profile, enabled: false }))
      .toEqual({ score: 0, normalizedScore: 0, components: { number: 0 }, trace: [] });
  });
});
