import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
import type { D1TerminalMomentumGenerationProfile } from "../src/lib/d1TerminalMomentumInfluence";
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

const d1Profile: D1TerminalMomentumGenerationProfile = {
  enabled: true,
  userEnabled: true,
  internalStrength: "strong",
  stageMode: "early-unique",
  monthLabel: "Jun 2026",
  completedStageDrawCount: 1,
  targetDrawNumber: 2,
  traceLabel: "D1 Terminal Momentum SGI: ON · internal strong · Jun 2026 target D2 early unique expansion · 2x1.45 (strong) · soft weighting only",
  digits: [
    {
      digit: 2,
      strength: "strong",
      baseFactor: 1.45,
      numbers: [2, 12, 22, 32, 42],
      priorityNumbers: [12, 22, 32, 42],
      repeatNumbers: [2],
      reason: "test profile",
      nextHitRate: 0.75,
      nextUniqueRate: 0.75,
    },
  ],
  numberMultipliers: {
    2: 1.1575,
    12: 1.45,
    22: 1.45,
    32: 1.45,
    42: 1.45,
  },
};

describe("generateCandidates D1 terminal momentum influence", () => {
  it("passes D1 SGI evidence into accepted candidates without acting as a hard filter", () => {
    const trace: string[] = [];
    const result = generateCandidates(
      1,
      [],
      knobs,
      (message) => trace.push(message),
      [],
      [],
      false,
      0,
      [],
      [12],
      [],
      undefined,
      0,
      0,
      1,
      0,
      [],
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
      200,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      d1Profile,
    );

    expect(result.candidates).toHaveLength(1);
    expect([...result.candidates[0].main, ...result.candidates[0].supp]).toContain(12);
    expect(result.candidates[0].d1TerminalMomentumHits).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0].d1TerminalMomentumScore).toBeGreaterThan(0);
    expect(trace.join(" ")).toContain("D1 Terminal Momentum SGI");
    expect(trace.join(" ")).toContain("soft weighting");
  });
});
