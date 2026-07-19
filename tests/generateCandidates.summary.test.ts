import { describe, expect, it } from "vitest";

import { generateCandidates, type GenerateCandidatesResult } from "../src/generateCandidates";
import type { Draw, Knobs } from "../src/types";

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

function withFixedRandom<T>(value: number, run: () => T): T {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

function withSeededRandom<T>(seed: number, run: () => T): T {
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
}

function runGenerator(overrides: Partial<{
  minOGAPercentile: number;
  pastOGAScores: number[];
  history: Draw[];
  progressSetter: (result: GenerateCandidatesResult) => void;
}> = {}) {
  return withFixedRandom(0, () =>
    generateCandidates(
      3,
      overrides.history ?? [],
      knobs,
      () => {},
      [],
      [],
      false,
      overrides.minOGAPercentile ?? 0,
      overrides.pastOGAScores ?? [],
      [],
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
      undefined,
      20,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      overrides.progressSetter,
    )
  );
}

function runRatioGenerator() {
  return withSeededRandom(20260528, () =>
    generateCandidates(
      500,
      [],
      knobs,
      () => {},
      [],
      ["4:4", "5:3", "3:5", "6:2", "2:6"],
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
      [
        { ratio: "4:4", count: 33 },
        { ratio: "5:3", count: 25 },
        { ratio: "3:5", count: 17 },
        { ratio: "6:2", count: 17 },
        { ratio: "2:6", count: 8 },
      ],
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
      250,
    )
  );
}

describe("generateCandidates summaries and OGA floor", () => {
  it("returns an honest odd/even ratio summary for accepted candidates", () => {
    const result = runGenerator();

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.ratioSummary.totalAccepted).toBe(result.candidates.length);
    expect(Object.values(result.ratioSummary.acceptedRatios).reduce((sum, count) => sum + count, 0)).toBe(result.candidates.length);
  });

  it("emits partial progress snapshots as candidates are accepted", () => {
    const snapshots: GenerateCandidatesResult[] = [];
    const result = runGenerator({
      progressSetter: (snapshot) => snapshots.push(snapshot),
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].candidates.length).toBeGreaterThan(0);
    expect(snapshots[0].rejectionStats.accepted).toBe(snapshots[0].candidates.length);
    expect(snapshots[0].rejectionStats.totalAttempts).toBeGreaterThan(0);
  });

  it("enforces selected odd/even ratio quotas from their relative history percentages", () => {
    const result = runRatioGenerator();

    expect(result.candidates).toHaveLength(500);
    expect(result.ratioSummary.acceptedRatios).toEqual({
      "4:4": 165,
      "5:3": 125,
      "3:5": 85,
      "6:2": 85,
      "2:6": 40,
    });
  });

  it("enforces minOGAPercentile when a historical OGA reference distribution is supplied", () => {
    const history = [
      { date: "2024-01-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-01-02", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
    ];
    const result = runGenerator({
      history,
      minOGAPercentile: 50,
      pastOGAScores: [999_999],
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejectionStats.ogaBias).toBeGreaterThan(0);
    expect(result.ratioSummary.totalAccepted).toBe(0);
  });
});
