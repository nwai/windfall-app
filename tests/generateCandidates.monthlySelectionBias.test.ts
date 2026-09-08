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

function withFixedRandom<T>(value: number, run: () => T): T {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

function createMonthlyBucketOptions(times1Count: number, selectedTimes1: number[], biasEnabled: boolean) {
  return {
    constraints: {
      undrawn: 0,
      times1: times1Count,
      times2: 0,
      times3: 0,
      times4: 0,
      times5: 0,
      times6: 0,
      times7: 0,
      times8: 0,
    },
    buckets: {
      undrawn: new Set<number>(),
      times1: new Set<number>([1, 2, 3, 4]),
      times2: new Set<number>(),
      times3: new Set<number>(),
      times4: new Set<number>(),
      times5: new Set<number>(),
      times6: new Set<number>(),
      times7: new Set<number>(),
      times8: new Set<number>(),
    },
    allowShortfall: true,
    selectedNumbersByBucket: {
      undrawn: [],
      times1: [...selectedTimes1],
      times2: [],
      times3: [],
      times4: [],
      times5: [],
      times6: [],
      times7: [],
      times8: [],
    },
    selectedNumberBiasEnabled: biasEnabled,
  };
}

function runMonthlyConstructiveCandidate(forcedNumbers: number[], times1Count: number, selectedTimes1: number[], biasEnabled: boolean) {
  const trace: string[] = [];
  const args: any[] = [
    1,
    [],
    knobs,
    (msg: string) => trace.push(msg),
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
    createMonthlyBucketOptions(times1Count, selectedTimes1, biasEnabled),
    20,
  ];

  const result = (generateCandidates as (...innerArgs: any[]) => ReturnType<typeof generateCandidates>)(...args);
  return { result, trace };
}

describe("generateCandidates monthly constructive selection bias", () => {
  it("favours clicked bucket numbers when the bias toggle is enabled", () => {
    const withoutBias = withFixedRandom(0.75, () => runMonthlyConstructiveCandidate([11, 12, 13, 14, 15, 16, 17], 1, [3], false));
    const withBias = withFixedRandom(0.75, () => runMonthlyConstructiveCandidate([11, 12, 13, 14, 15, 16, 17], 1, [3], true));

    expect(withoutBias.result.candidates).toHaveLength(1);
    expect(withBias.result.candidates).toHaveLength(1);
    expect(withoutBias.result.candidates[0].supp).toEqual([1, 17]);
    expect(withBias.result.candidates[0].supp).toEqual([3, 17]);
    expect(withoutBias.trace.some((msg) => msg.includes("selected-number bias enabled"))).toBe(false);
    expect(withBias.trace.some((msg) => msg.includes("selected-number bias enabled"))).toBe(true);
  });

  it("keeps randomness by still allowing unclicked bucket numbers to fill remaining bucket slots", () => {
    const run = withFixedRandom(0.75, () => runMonthlyConstructiveCandidate([11, 12, 13, 14, 15, 16], 2, [3], true));

    expect(run.result.candidates).toHaveLength(1);
    expect(run.result.candidates[0].supp).toEqual([3, 4]);
  });

  it("cycles full bucket coverage combinations when the planner is enabled", () => {
    const trace: string[] = [];
    const monthlyOptions = createMonthlyBucketOptions(2, [], false);
    monthlyOptions.buckets.times1 = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]);
    const result = withFixedRandom(0, () => (generateCandidates as (...innerArgs: any[]) => ReturnType<typeof generateCandidates>)(
      28,
      [],
      knobs,
      (msg: string) => trace.push(msg),
      [],
      [],
      false,
      0,
      [],
      [21, 22, 23, 24, 25, 26],
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
      {
        ...monthlyOptions,
        bucketCoveragePlanner: { enabled: true },
      },
      1,
    ));

    expect(result.candidates).toHaveLength(28);
    const pairSignatures = new Set(result.candidates.map((candidate) => candidate.supp.join(",")));
    expect(pairSignatures.size).toBe(28);
    expect(trace.join("\n")).toContain("Bucket Coverage Planner Full coverage");
    expect(trace.join("\n")).toContain("accepted coverage signature");
  });

  it("keeps undrawn requirements random when they are ignored by the coverage planner", () => {
    const trace: string[] = [];
    const monthlyOptions = createMonthlyBucketOptions(2, [], false);
    monthlyOptions.constraints.undrawn = 4;
    monthlyOptions.buckets.undrawn = new Set<number>([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    monthlyOptions.buckets.times1 = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]);
    const result = withFixedRandom(0, () => (generateCandidates as (...innerArgs: any[]) => ReturnType<typeof generateCandidates>)(
      28,
      [],
      knobs,
      (msg: string) => trace.push(msg),
      [],
      [],
      false,
      0,
      [],
      [31, 32],
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
      {
        ...monthlyOptions,
        bucketCoveragePlanner: { enabled: true, ignoredBucketKeys: ["undrawn"] },
      },
      1,
    ));

    expect(result.candidates).toHaveLength(28);
    const pairSignatures = new Set(result.candidates.map((candidate) => candidate.supp.join(",")));
    expect(pairSignatures.size).toBe(28);
    expect(trace.join("\n")).toContain("0x req 4, random fill");
    expect(trace.join("\n")).toContain("Bucket Coverage Planner Full coverage");
  });
});
