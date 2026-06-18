import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
import type { ScoringGenerationProfile } from "../src/lib/scoringGenerationInfluence";
import type { Knobs } from "../src/types";

const knobs: Knobs = {
  enableSDE1: false,
  enableHC3: false,
  enableOGA: false,
  enableGPWF: false,
  enableEntropy: false,
  enableHamming: false,
  enableJaccard: false,
  F: 0,
  M: 0,
  Q: 0,
  Y: 0,
  Historical_Weight: 0,
  gpwf_window_size: 0,
  gpwf_bias_factor: 0,
  gpwf_floor: 0,
  gpwf_scale_multiplier: 0,
  lambda: 0,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
};

const withSeededRandom = <T,>(seed: number, run: () => T): T => {
  const originalRandom = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
};

const scoringProfile: ScoringGenerationProfile = {
  enabled: true,
  influence: "strong",
  scope: "mains-plus-supps",
  numberScores: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, 45 - index])),
  numberMultipliers: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, index < 10 ? 2 : 0.75])),
  ratioScores: { "4:4": 300, "5:3": 240, "3:5": 216 },
  terminalDigitSetScores: { "0,1,2,3,4,5,6,7": 80, "1,2,3,4,5,6,7,8": 75 },
  straightRunScores: { "0,1,2,3,4,5,6,7": 25, "1,2,3,4,5,6,7,8": 20 },
  traceLabel: "Scoring Diagnostics strong evidence weighting active; diagnostic support only.",
};

const runGenerator = (options: {
  num?: number;
  selectedRatios?: string[];
  ratioOptions?: { ratio: string; count: number; percent?: number }[];
  profile?: ScoringGenerationProfile;
} = {}) => withSeededRandom(20260618, () =>
  generateCandidates(
    options.num ?? 20,
    [],
    knobs,
    () => {},
    [],
    options.selectedRatios ?? [],
    false,
    0,
    [],
    [],
    [],
    undefined,
    0,
    0,
    1,
    0,
    options.ratioOptions ?? [],
    0,
    0,
    0,
    0,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    400,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.profile,
  )
);

describe("generateCandidates scoring diagnostics influence", () => {
  it("keeps scoring evidence absent when the influence profile is not supplied", () => {
    const result = runGenerator({ num: 6 });

    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.every((candidate) => candidate.scoreEvidence === undefined)).toBe(true);
  });

  it("annotates accepted candidates when scoring diagnostics influence is enabled", () => {
    const result = runGenerator({ num: 6, profile: scoringProfile });

    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.every((candidate) => typeof candidate.scoreEvidence === "number")).toBe(true);
    expect(result.candidates.every((candidate) => candidate.scoreEvidence! >= 0 && candidate.scoreEvidence! <= 1)).toBe(true);
    expect(result.candidates.some((candidate) => candidate.scoreEvidenceTrace?.join(" ").includes("diagnostic evidence"))).toBe(true);
    expect(result.candidates.map((candidate) => candidate.trace?.join(" ") ?? "").join(" ")).not.toMatch(/predict|probability|guarantee/i);
  });

  it("preserves selected odd/even quotas while scoring influence is active", () => {
    const result = runGenerator({
      num: 60,
      selectedRatios: ["4:4", "5:3", "3:5"],
      ratioOptions: [
        { ratio: "4:4", count: 3 },
        { ratio: "5:3", count: 2 },
        { ratio: "3:5", count: 1 },
      ],
      profile: scoringProfile,
    });

    expect(result.candidates).toHaveLength(60);
    expect(result.ratioSummary.acceptedRatios).toEqual({
      "4:4": 30,
      "5:3": 20,
      "3:5": 10,
    });
  });
});
