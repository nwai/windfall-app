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

describe("generateCandidates strict drought quota", () => {
  it("constructively seeds the requested minimum from the eligible strict drought shortlist", () => {
    const trace: string[] = [];
    const result = withSeededRandom(20260812, () =>
      generateCandidates(
        6,
        [],
        knobs,
        (message) => trace.push(message),
        [1],
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
        undefined,
        undefined,
        {
          enabled: true,
          minCount: 3,
          shortlist: [1, 2, 3],
          rankMultipliers: { 1: 2, 2: 1.7, 3: 1.4 },
          sourceLabel: "test",
        },
      )
    );

    expect(result.candidates).toHaveLength(6);
    for (const candidate of result.candidates) {
      const numbers = [...candidate.main, ...candidate.supp];
      expect(numbers.filter((number) => number === 2 || number === 3)).toHaveLength(2);
      expect(numbers).not.toContain(1);
    }
    expect(result.rejectionStats.strictDroughtQuota).toBe(0);
    expect(trace.join(" ")).toContain("effective minimum 2");
    expect(trace.join(" ")).toContain("Strict drought quota results");
  });
});
