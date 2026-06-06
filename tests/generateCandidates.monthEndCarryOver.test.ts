import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
import { buildMonthEndCarryOverWeighting } from "../src/lib/monthEndCarryOver";
import type { Draw, Knobs } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

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

function runForcedSuppCandidate(monthEndCarryOverWeights?: Record<number, number>) {
  const excludedNumbers = Array.from({ length: 36 }, (_, index) => index + 8);
  const args: any[] = [
    1,
    [],
    knobs,
    () => {},
    excludedNumbers,
    [],
    false,
    0,
    [],
    [1, 2, 3, 4, 5, 6, 7],
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
    20,
    undefined,
    undefined,
  ];

  args.push(undefined, undefined, monthEndCarryOverWeights);
  return (generateCandidates as (...innerArgs: any[]) => ReturnType<typeof generateCandidates>)(...args);
}

describe("generateCandidates month-end carry-over weighting", () => {
  it("biases the final open slot toward carry-over weighted numbers", () => {
    const withoutCarryOver = withFixedRandom(0.34, () => runForcedSuppCandidate());
    const withCarryOver = withFixedRandom(0.34, () => runForcedSuppCandidate({ 44: 1, 45: 2 }));

    expect(withoutCarryOver.candidates).toHaveLength(1);
    expect(withCarryOver.candidates).toHaveLength(1);
    expect(withoutCarryOver.candidates[0].supp).toEqual([7, 44]);
    expect(withCarryOver.candidates[0].supp).toEqual([7, 45]);
  });

  it("biases the open slot toward current last-to-first boundary repeats when they are in the carry-over pool", () => {
    const history: Draw[] = [
      draw("2026-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-17", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-01-24", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2026-01-31", [33, 34, 35, 36, 37, 44], [38, 39]),
      draw("2026-02-03", [40, 41, 42, 43, 44, 45], [1, 2]),
      draw("2026-02-10", [3, 4, 5, 6, 7, 8], [9, 10]),
    ];
    const weighting = buildMonthEndCarryOverWeighting(history, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: new Date("2026-02-15T00:00:00Z"),
    });

    const withoutCarryOver = withFixedRandom(0.6, () => runForcedSuppCandidate());
    const withCarryOver = withFixedRandom(0.6, () => runForcedSuppCandidate(weighting.weights));

    expect(weighting.boundaryRepeatNumbers).toEqual([44]);
    expect(weighting.weights[44]).toBeGreaterThan(1);
    expect(withoutCarryOver.candidates).toHaveLength(1);
    expect(withCarryOver.candidates).toHaveLength(1);
    expect(withoutCarryOver.candidates[0].supp).toEqual([7, 45]);
    expect(withCarryOver.candidates[0].supp).toEqual([7, 44]);
  });
});
