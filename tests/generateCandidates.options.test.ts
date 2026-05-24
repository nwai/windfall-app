import { describe, expect, it } from "vitest";
import { generateCandidates } from "../src/generateCandidates";
import { validateTrickyRule } from "../src/trickyRule";
import type { Draw, Knobs } from "../src/types";

function draw(main: number[], supp: number[] = [7, 8]): Draw {
  return { main, supp, date: "2026-01-01" };
}

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

describe("generateCandidates options API", () => {
  it("generates candidates from named options without positional argument drift", () => {
    const trace: string[] = [];
    const result = generateCandidates({
      num: 2,
      history: [
        draw([1, 2, 3, 4, 5, 6]),
        draw([9, 10, 11, 12, 13, 14]),
      ],
      knobs,
      traceSetter: (updater) => {
        const next = typeof updater === "function" ? updater(trace) : updater;
        trace.splice(0, trace.length, ...next);
      },
    });

    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates) {
      expect(candidate.main).toHaveLength(6);
      expect(candidate.supp).toHaveLength(2);
      expect(new Set([...candidate.main, ...candidate.supp]).size).toBe(8);
    }
  });

  it("uses the full Tricky Rule validator, not only extreme odd/even rejection", () => {
    const forced = [1, 9, 15, 21, 4, 6, 8, 10];
    expect(validateTrickyRule(forced).valid).toBe(false);

    const result = generateCandidates({
      num: 1,
      history: [
        draw([22, 23, 24, 25, 26, 27]),
        draw([28, 29, 30, 31, 32, 33]),
      ],
      knobs,
      traceSetter: () => undefined,
      forcedNumbers: forced,
      useTrickyRule: true,
      attemptMultiplier: 2,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejectionStats.tricky).toBeGreaterThan(0);
  });
});
