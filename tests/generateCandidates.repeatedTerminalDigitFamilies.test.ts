import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
import type { RepeatedTerminalDigitFamilyOptions } from "../src/lib/repeatedTerminalDigitFamilies";
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

function generateForcedRow(rule: RepeatedTerminalDigitFamilyOptions) {
  const trace: string[] = [];
  const result = generateCandidates(
    1,
    [],
    knobs,
    (msg) => trace.push(msg),
    [],
    [],
    false,
    0,
    [],
    [33, 27, 21, 31, 26, 43, 30, 20],
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
    25,
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
    rule,
  );

  return { result, trace };
}

describe("generateCandidates repeated terminal digit families", () => {
  it("can enforce exact repeated-family count across mains and supps", () => {
    const passing = generateForcedRow({
      enabled: true,
      scope: "mainAndSupp",
      mode: "exactly",
      count: 3,
    });
    const failing = generateForcedRow({
      enabled: true,
      scope: "mainAndSupp",
      mode: "exactly",
      count: 2,
    });

    expect(passing.result.candidates).toHaveLength(1);
    expect(passing.result.rejectionStats.repeatedTerminalFamilies).toBe(0);
    expect(failing.result.candidates).toHaveLength(0);
    expect(failing.result.rejectionStats.repeatedTerminalFamilies).toBeGreaterThan(0);
    expect(failing.trace.join("\n")).toContain("Repeated Terminal Digit Families rule");
  });

  it("respects mains-only scope separately from supplementary numbers", () => {
    const passing = generateForcedRow({
      enabled: true,
      scope: "main",
      mode: "exactly",
      count: 2,
    });
    const failing = generateForcedRow({
      enabled: true,
      scope: "main",
      mode: "exactly",
      count: 3,
    });

    expect(passing.result.candidates).toHaveLength(1);
    expect(failing.result.candidates).toHaveLength(0);
    expect(failing.result.rejectionStats.repeatedTerminalFamilies).toBeGreaterThan(0);
  });
});
