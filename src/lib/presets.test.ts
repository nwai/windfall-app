import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET_ACCEPTANCE_NEEDS_COUNTS,
  DEFAULT_PRESET_MRB_BUCKET_BOOSTS,
  DEFAULT_PRESET_PICK_SIX_MANUAL,
  normalizeAppPresetSnapshot,
  type AppPresetSnapshot,
} from "./presets";

function baseSnapshot(overrides: Partial<AppPresetSnapshot> = {}): AppPresetSnapshot {
  return {
    drawWindowMode: "lastN",
    rangeFrom: 0,
    rangeTo: 0,
    windowEnabled: false,
    windowMode: "W",
    customDrawCount: 52,
    knobs: {},
    entropyEnabled: false,
    entropyThreshold: 1,
    hammingEnabled: false,
    hammingThreshold: 3,
    jaccardEnabled: false,
    jaccardThreshold: 0.5,
    lambdaEnabled: false,
    lambda: 0.85,
    gpwfEnabled: false,
    gpwf_window_size: 12,
    gpwf_bias_factor: 1,
    gpwf_floor: 0,
    gpwf_scale_multiplier: 1,
    selectedRatios: [],
    useTrickyRule: false,
    excludedNumbers: [],
    trendLookback: 4,
    trendThreshold: 0.02,
    allowedTrendRatios: [],
    trendSelectedNumbers: [],
    rankingWeights: { oga: 0.7, sel: 0.2, recent: 0.1 },
    weightedTargets: {},
    applyZoneBias: false,
    zoneGamma: 1,
    zpa: { selectedZones: Array(9).fill(true), normalizeMode: "all", groups: [] },
    ...overrides,
  };
}

describe("normalizeAppPresetSnapshot", () => {
  it("fills new preset-controlled state for older snapshots", () => {
    const normalized = normalizeAppPresetSnapshot(baseSnapshot());

    expect(normalized.acceptanceNeedsEnabled).toBe(false);
    expect(normalized.acceptanceNeedsCounts).toEqual(DEFAULT_PRESET_ACCEPTANCE_NEEDS_COUNTS);
    expect(normalized.maxLastDrawMatchesEnabled).toBe(false);
    expect(normalized.maxLastDrawMatchesValue).toBe(3);
    expect(normalized.latestNeighbourSupportEnabled).toBe(false);
    expect(normalized.numCandidates).toBe(8);
    expect(normalized.batchSize).toBe(200);
    expect(normalized.batchSessionRuns).toBe(10);
    expect(normalized.octagonalTop).toBe(9);
    expect(normalized.rankingWeights.selHitsEnabled).toBe(false);
    expect(normalized.rankingWeights.recentHitsEnabled).toBe(false);
    expect(normalized.monthlyConstructiveEnabled).toBe(false);
    expect(normalized.mrbEnabled).toBe(false);
    expect(normalized.mrbIncludeSupp).toBe(true);
    expect(normalized.mrbBucketBoosts).toEqual(DEFAULT_PRESET_MRB_BUCKET_BOOSTS);
    expect(normalized.pasteWeightedForcedNumbers).toEqual([]);
    expect(normalized.pickSixSource).toBe("manual");
    expect(normalized.pickSixManual).toEqual(DEFAULT_PRESET_PICK_SIX_MANUAL);
  });

  it("sanitizes malformed imported values before they reach UI state", () => {
    const normalized = normalizeAppPresetSnapshot(
      baseSnapshot({
        userSelectedNumbers: [1, "2", 2, 46] as any,
        weightedTargets: { 1: 2, 2: Number.NaN, 20: 9 } as any,
        acceptanceNeedsCounts: { undrawn: -2, times1: 2.4, times2: "3" } as any,
        trendLookback: -5,
        trendThreshold: Number.POSITIVE_INFINITY,
        allowedTrendRatios: ["4-2-2", "4-4-4", "bad"],
        droughtBreakSelectedNumbers: [7, "8", 9, 10, 46, 7] as any,
        pasteWeightedForcedNumbers: [3, "4", 4, 50, 0, 3] as any,
        maxLastDrawMatchesValue: 99,
        numCandidates: 0,
        batchSize: Number.POSITIVE_INFINITY,
        batchSessionRuns: -4,
        octagonalTop: 60,
        mrbBucketBoosts: { undrawn: 50, times1: 3, times2: "bad" } as any,
        pickSixSource: "bad" as any,
        pickSixManual: [45, 45, 0, 46, 10] as any,
      }),
    );

    expect(normalized.acceptanceNeedsCounts).toMatchObject({ undrawn: 0, times1: 2, times2: 3 });
    expect(normalized.userSelectedNumbers).toEqual([1, 2]);
    expect(normalized.weightedTargets).toEqual({ 1: 2, 2: 1 });
    expect(normalized.trendLookback).toBe(4);
    expect(normalized.trendThreshold).toBe(0.02);
    expect(normalized.allowedTrendRatios).toEqual(["4-2-2"]);
    expect(normalized.droughtBreakSelectedNumbers).toEqual([7, 8, 9]);
    expect(normalized.pasteWeightedForcedNumbers).toEqual([3, 4]);
    expect(normalized.maxLastDrawMatchesValue).toBe(6);
    expect(normalized.numCandidates).toBe(1);
    expect(normalized.batchSize).toBe(200);
    expect(normalized.batchSessionRuns).toBe(1);
    expect(normalized.octagonalTop).toBe(45);
    expect(normalized.mrbBucketBoosts?.times2).toBe(1);
    expect(normalized.pickSixSource).toBe("manual");
    expect(normalized.pickSixManual).toEqual([45, 10, 1, 2, 3, 4, 5, 6]);
  });
});
