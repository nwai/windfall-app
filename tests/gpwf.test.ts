import { describe, expect, it } from "vitest";
import { gpwfScore } from "../src/gpwf";
import type { CandidateSet, Draw, Knobs } from "../src/types";

function draw(main: number[]): Draw {
  return { main, supp: [], date: "2026-01-01" };
}

const knobs: Knobs = {
  enableSDE1: false,
  enableHC3: false,
  enableOGA: false,
  enableGPWF: true,
  enableEntropy: false,
  enableHamming: false,
  enableJaccard: false,
  F: 0,
  M: 0,
  Q: 0,
  Y: 0,
  Historical_Weight: 0,
  gpwf_window_size: 3,
  gpwf_bias_factor: 0,
  gpwf_floor: 0,
  gpwf_scale_multiplier: 1,
  lambda: 0,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
};

describe("gpwfScore", () => {
  it("scores numbers from the most recent window higher than old-window numbers", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6]),
      draw([1, 2, 3, 4, 5, 6]),
      draw([1, 2, 3, 4, 5, 6]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
    ];
    const oldCandidate: CandidateSet = { main: [1, 2, 3, 4, 5, 6], supp: [] };
    const recentCandidate: CandidateSet = { main: [40, 41, 42, 43, 44, 45], supp: [] };

    expect(gpwfScore(recentCandidate, history, knobs)).toBeGreaterThan(
      gpwfScore(oldCandidate, history, knobs)
    );
  });
});
