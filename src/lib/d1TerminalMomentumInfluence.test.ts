import { describe, expect, it } from "vitest";

import type { D1TerminalMomentumAnalysis } from "./endingDigitSequences";
import {
  buildD1TerminalMomentumGenerationProfile,
  d1TerminalMomentumMultiplier,
  scoreD1TerminalMomentumCandidate,
} from "./d1TerminalMomentumInfluence";

const baseAnalysis = (): D1TerminalMomentumAnalysis => ({
  monthKey: "2026-06",
  monthLabel: "Jun 2026",
  includeSupp: true,
  completedStageDrawCount: 1,
  targetDrawNumber: 2,
  totalDrawsInMonth: 13,
  stageMode: "early-unique",
  overallSuggestedStrength: "strong",
  warnings: [],
  activeRows: [
    {
      digit: 2,
      parity: "even",
      familyNumbers: [2, 12, 22, 32, 42],
      d1Numbers: [2],
      stageNumbers: [2],
      d1Hits: 2,
      d1Unique: 1,
      stageHits: 2,
      stageUnique: 1,
      stageNewHits: 0,
      stageNewUnique: 0,
      currentStageMoving: true,
      suggestedStrength: "strong",
      reason: "early unique expansion repeatedly appeared in prior months",
      prior: {
        d1MultiTrials: 4,
        baselineTrials: 8,
        nextHitRate: 0.75,
        nextUniqueRate: 0.75,
        baselineNextHitRate: 0.25,
        baselineNextUniqueRate: 0.25,
        hitLift: 3,
        uniqueLift: 3,
        avgNextHits: 1,
        avgNextUniqueAdds: 1,
        avgPostStageHits: 5,
        avgPostStageUniqueAdds: 3,
      },
    },
  ],
  rows: [],
});

describe("d1TerminalMomentumInfluence", () => {
  it("keeps the generator neutral when the user switch is off", () => {
    const profile = buildD1TerminalMomentumGenerationProfile(baseAnalysis(), false);

    expect(profile.enabled).toBe(false);
    expect(profile.userEnabled).toBe(false);
    expect(d1TerminalMomentumMultiplier(12, profile)).toBe(1);
    expect(profile.traceLabel).toContain("OFF");
  });

  it("boosts early-stage same-terminal unseen numbers more than current-stage repeats", () => {
    const profile = buildD1TerminalMomentumGenerationProfile(baseAnalysis(), true);

    expect(profile.enabled).toBe(true);
    expect(profile.internalStrength).toBe("strong");
    expect(d1TerminalMomentumMultiplier(12, profile)).toBeCloseTo(1.45, 5);
    expect(d1TerminalMomentumMultiplier(2, profile)).toBeCloseTo(1.1575, 5);
    expect(d1TerminalMomentumMultiplier(13, profile)).toBe(1);
  });

  it("scores accepted candidates for trace/provenance without creating a hard filter", () => {
    const profile = buildD1TerminalMomentumGenerationProfile(baseAnalysis(), true);
    const evidence = scoreD1TerminalMomentumCandidate([2, 12, 13, 24, 35, 41, 44, 45], profile);

    expect(evidence.hits).toBe(2);
    expect(evidence.normalizedScore).toBeGreaterThan(0);
    expect(evidence.trace.join(" ")).toContain("2:2");
  });

  it("reports ON/internal off when the planning month has no D1 evidence yet", () => {
    const profile = buildD1TerminalMomentumGenerationProfile(null, true);

    expect(profile.userEnabled).toBe(true);
    expect(profile.enabled).toBe(false);
    expect(profile.traceLabel).toContain("internal off");
    expect(profile.traceLabel).toContain("no current-month D1 evidence");
  });
});
