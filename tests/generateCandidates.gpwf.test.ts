import { describe, expect, it } from "vitest";
import { generateCandidates } from "../src/generateCandidates";
import type { Draw, Knobs } from "../src/types";

function draw(main: number[], supp: number[] = [38, 39], date = "2026-01-01"): Draw {
  return { main, supp, date };
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

function withFixedRandom<T>(value: number, run: () => T): T {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

describe("generateCandidates GPWF weighting", () => {
  it("uses GPWF to bias generation toward recently frequent numbers", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8]),
      draw([9, 10, 11, 12, 13, 14], [15, 16]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
    ];

    const result = withFixedRandom(0, () =>
      generateCandidates(
        1,
        history,
        knobs,
        () => {},
        [],
        [],
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
        [],
        0,
        0,
        0,
        0,
      )
    );

    expect(result.candidates).toHaveLength(1);
    expect([...result.candidates[0].main, ...result.candidates[0].supp].every((n) => n >= 38 && n <= 45)).toBe(true);
  });
});
