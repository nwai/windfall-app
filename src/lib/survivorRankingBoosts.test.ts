import { describe, expect, it } from "vitest";
import { applySurvivorRankingBoosts, buildSurvivorRankingBoostState, survivorRankingBoostDescriptions } from "./survivorRankingBoosts";

const options = {
  selHitsEnabled: true, selectedNumberCount: 4, selBonusThreshold: 3, selBonusWeight: 0.2,
  patternMode: "boost" as const, selectedPatternCount: 2, patternBoostFactor: 0.15,
};

describe("explicit survivor ranking boosts", () => {
  it("adds independent bonuses after normalization even with a zero base score", () => {
    const state = buildSurvivorRankingBoostState(options);
    const score = applySurvivorRankingBoosts(0, 3, 2, state);
    expect(score).toEqual({ score: 0.5, selectedBonus: 0.2, patternBonus: 0.3 });
    expect(applySurvivorRankingBoosts(0.8, 3, 2, state).score).toBeCloseTo(1.3);
  });

  it("applies the SelHits bonus at the threshold, not below it", () => {
    const state = buildSurvivorRankingBoostState({ ...options, selectedPatternCount: 0 });
    expect(applySurvivorRankingBoosts(0.25, 2, 0, state).score).toBe(0.25);
    expect(applySurvivorRankingBoosts(0.25, 3, 0, state).score).toBe(0.45);
    expect(applySurvivorRankingBoosts(0.25, 8, 0, state).score).toBe(0.45);
  });

  it.each([
    { selHitsEnabled: false }, { selectedNumberCount: 0 }, { selBonusWeight: 0 },
  ])("keeps the SelHits bonus neutral when inactive: %j", (override) => {
    const state = buildSurvivorRankingBoostState({ ...options, ...override });
    expect(state.selectedActive).toBe(false);
    expect(applySurvivorRankingBoosts(0.5, 8, 0, state).score).toBe(0.5);
    expect(survivorRankingBoostDescriptions(state).join(" ")).not.toContain("SelHits threshold bonus");
  });

  it.each([
    { patternMode: "restrict" as const }, { selectedPatternCount: 0 }, { patternBoostFactor: 0 },
  ])("keeps the pattern bonus neutral when inactive: %j", (override) => {
    const state = buildSurvivorRankingBoostState({ ...options, ...override });
    expect(state.patternActive).toBe(false);
    expect(applySurvivorRankingBoosts(0.5, 0, 2, state).score).toBe(0.5);
  });

  it("bounds invalid imported bonus settings and discloses active arithmetic", () => {
    const state = buildSurvivorRankingBoostState({ ...options, selBonusThreshold: 99, selBonusWeight: 99, patternBoostFactor: NaN });
    expect(state.selectedThreshold).toBe(8);
    expect(state.selectedBonus).toBe(5);
    expect(state.patternActive).toBe(false);
    expect(survivorRankingBoostDescriptions(state)).toEqual(["SelHits threshold bonus +5 at >=8"]);
  });

  it("supports a deliberately zero threshold only while SelHits and a selection are active", () => {
    const state = buildSurvivorRankingBoostState({ ...options, selBonusThreshold: 0, selectedPatternCount: 0 });
    expect(applySurvivorRankingBoosts(0, 0, 0, state).selectedBonus).toBe(0.2);
  });
});
