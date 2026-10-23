import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCandidates, applyOddEvenRatioQuotas } from "../src/generateCandidates";
import { applySurvivorRankingBoosts, buildSurvivorRankingBoostState } from "../src/lib/survivorRankingBoosts";
import { windowPatternForNumbers } from "../src/lib/windowPatternMatching";
import type { CandidateSet, Knobs } from "../src/types";
import { SETTINGS_MODEL_VERSION } from "../src/lib/settingsTransparency";

const knobs: Knobs = {
  enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false,
  enableEntropy: false, enableHamming: false, enableJaccard: false,
  F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0, gpwf_window_size: 0,
  gpwf_bias_factor: 0, gpwf_floor: 0, gpwf_scale_multiplier: 0, lambda: 0,
  octagonal_top: 9, exact_set_override: false, hamming_relax: false, gpwf_targeted_mode: false,
};

function generate(patternOptions?: Parameters<typeof generateCandidates>[24]) {
  let state = 4917;
  const originalRandom = Math.random;
  Math.random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
  try {
    return generateCandidates(128, [], knobs, () => {}, [45], [], false, 0, [], [1], [], undefined,
      0, 0, 1, 0, undefined, 0, 0, 0, 0, undefined, undefined, undefined, patternOptions);
  } finally {
    Math.random = originalRandom;
  }
}

const numbers = (candidate: CandidateSet) => [...candidate.main, ...candidate.supp];
const stateFor = (overrides = {}) => buildSurvivorRankingBoostState({
  selHitsEnabled: false, selectedNumberCount: 0, selBonusThreshold: 3, selBonusWeight: 0,
  patternMode: "boost", selectedPatternCount: 1, patternBoostFactor: 0.15, ...overrides,
});

describe("generation survivor boost integration", () => {
  it("changes survivors with pattern Boost without changing the accepted sampling pool", () => {
    const baseline = generate();
    const last = baseline.candidates.at(-1)!;
    const pattern = windowPatternForNumbers(numbers(last));
    const boosted = generate({ mode: "boost", boostFactor: 0.15, constraints: [pattern] });
    expect(boosted.candidates.map(numbers)).toEqual(baseline.candidates.map(numbers));
    expect(boosted.candidates[0].patternMatches).toBe(0);
    const state = stateFor();
    const ranked = boosted.candidates.map((candidate) => ({ candidate,
      score: applySurvivorRankingBoosts(0, 0, candidate.patternMatches ?? 0, state).score,
    })).sort((a, b) => b.score - a.score);
    expect(ranked[0].score).toBe(0.15);
    expect(ranked[0].candidate.patternMatches).toBeGreaterThan(0);
    expect(ranked[0].candidate).not.toBe(boosted.candidates[0]);
    expect(ranked.every(({ candidate }) => numbers(candidate).includes(1) && !numbers(candidate).includes(45))).toBe(true);
  });

  it("keeps captured mains-only Restrict patterns functional", () => {
    const pattern = windowPatternForNumbers(generate().candidates[0].main);
    const result = generate({ mode: "restrict", constraints: [pattern], boostFactor: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => windowPatternForNumbers(candidate.main).sum === pattern.sum)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.patternMatches === 1)).toBe(true);
    expect(applySurvivorRankingBoosts(0, 0, 1, stateFor({ patternMode: "restrict" })).score).toBe(0);
  });

  it("changes survivors at the SelHits threshold and still honors final odd/even quotas", () => {
    const pool = generate().candidates;
    const selection = new Set(numbers(pool.at(-1)!).filter((number) => number !== 1));
    const state = stateFor({ selHitsEnabled: true, selectedNumberCount: selection.size,
      selBonusThreshold: 7, selBonusWeight: 0.2, selectedPatternCount: 0 });
    const ranked = pool.map((candidate) => ({ candidate, score: applySurvivorRankingBoosts(0,
      numbers(candidate).filter((number) => selection.has(number)).length, 0, state).score,
    })).sort((a, b) => b.score - a.score);
    expect(ranked[0].score).toBe(0.2);
    expect(numbers(ranked[0].candidate)).toEqual(numbers(pool.at(-1)!));
    const final = applyOddEvenRatioQuotas(ranked.map((row) => row.candidate), 2, ["4:4", "5:3"],
      [{ ratio: "4:4", count: 1 }, { ratio: "5:3", count: 1 }]);
    expect(final.candidates).toHaveLength(2);
    const odds = final.candidates.map((candidate) => numbers(candidate).filter((number) => number % 2 !== 0).length);
    expect(odds.sort()).toEqual([4, 5]);
  });

  it("wires both bonuses, live state updates and Trace in the common app ranking path", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("applySurvivorRankingBoosts(finalComposite, selHits, patternMatches, survivorState.boosts)");
    expect(app).toContain("finalCompositeAdj: rankingBoost.score");
    expect(app).toContain("survivorRankingBoostDescriptions(survivorState.boosts)");
    expect(app).toContain("selectedWindowPatterns, patternConstraintMode, patternBoostFactor, patternSumTolerance, activeScoringGenerationProfile");
    expect(app).toContain("onPatternBoostFactorChange={setPatternBoostFactor}");
    expect(app).toContain("selectedNumberCount={userSelectedNumbers.length}");
    expect(app).toContain("label: \"SelHits threshold bonus\"");
    expect(app).toContain("label: \"Window Stats pattern bonus\"");
    expect(SETTINGS_MODEL_VERSION).toBe("WF-settings-5");
  });
});
