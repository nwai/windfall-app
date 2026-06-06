import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
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

describe("generateCandidates sum filter", () => {
  it("rejects candidates outside an enabled sum range", () => {
    const result = generateCandidates(
      10,
      [],
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
      undefined,
      undefined,
      { enabled: true, min: 1, max: 1, includeSupp: true },
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
      25,
    );

    expect(result.candidates).toEqual([]);
    expect(result.rejectionStats.sumRange).toBeGreaterThan(0);
    expect(result.rejectionStats.accepted).toBe(0);
  });
});
