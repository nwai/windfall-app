import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
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

function runForcedCandidate(history: Draw[], forcedNumbers: number[], maxLastDrawMatches: number) {
  const args: any[] = [
    1,
    history,
    knobs,
    () => {},
    [],
    [],
    false,
    0,
    [],
    forcedNumbers,
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
    maxLastDrawMatches,
  ];

  return (generateCandidates as (...innerArgs: any[]) => ReturnType<typeof generateCandidates>)(...args);
}

describe("generateCandidates recent-draw logic", () => {
  it("applies maxLastDrawMatches against the latest draw by date even when history is newest-first", () => {
    const history: Draw[] = [
      { date: "2026-05-02", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2026-05-01", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
    ];

    const result = runForcedCandidate(history, [1, 2, 3, 4, 5, 6, 7, 8], 0);

    expect(result.candidates).toEqual([]);
    expect(result.rejectionStats.maxLastDraw).toBeGreaterThan(0);
  });
});
