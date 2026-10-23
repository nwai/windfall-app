import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateCandidates } from "../src/generateCandidates";
import { computeOGA } from "../src/utils/oga";
import type { Draw, Knobs } from "../src/types";
import type { OgaForecastBiasOptions } from "../src/lib/ogaDecileAcceptance";

// Controlled unit fixtures, not historical backtest outcomes.
vi.mock("../src/utils/oga", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/utils/oga")>(), computeOGA: vi.fn(() => 4.5),
}));
const knobs: Knobs = { enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false,
  enableEntropy: false, enableHamming: false, enableJaccard: false,
  F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0, gpwf_window_size: 0, gpwf_bias_factor: 0,
  gpwf_floor: 0, gpwf_scale_multiplier: 0, lambda: 0, octagonal_top: 9,
  exact_set_override: false, hamming_relax: false, gpwf_targeted_mode: false };
const history: Draw[] = [{ date: "2026-10-02", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];
const options: OgaForecastBiasOptions = { enabled: true, preferredBand: "mid", evidenceDrawCount: 1,
  deciles: { thresholds: [0, 1, 2, 3, 4, 5, 6, 7, 8], probs: [] }, preferredDeciles: [{ index: 5, weight: 1 }] };
function run(bias = options, random = 0.8) {
  const trace: string[] = [];
  const result = generateCandidates(1, history, knobs, (line) => trace.push(line), [], [], false, 0, [],
    [1, 2, 3, 4, 5, 6, 7, 8], [], undefined, 0, 0, 1, 0,
    undefined, 0, 0, 0, 0, undefined, undefined, undefined, undefined, bias,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, () => random);
  return { ...result, trace: trace.join("\n") };
}

beforeEach(() => vi.mocked(computeOGA).mockReset().mockReturnValue(4.5));
describe("main generator OGA decile gate", () => {
  it("does not admit an unselected decile through the otherwise-matching mid band", () => {
    const result = run({ ...options, preferredDeciles: [{ index: 2, weight: 1 }] }, 0);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejectionStats.ogaBias).toBeGreaterThan(0);
    expect(result.trace).toContain("No broad-band fallback");
  });

  it("does not rescue selected-band weighted rejections with the mid-band fallback", () => {
    const result = run({ ...options, preferredDeciles: [{ index: 5, weight: 1 }, { index: 7, weight: 9 }] });
    expect(result.candidates).toHaveLength(0);
    expect(result.trace).toMatch(/weighted rejects [1-9]/);
  });

  it("accepts the selected positive-weight band while leaving broad-band mode available when cleared", () => {
    expect(run().candidates).toHaveLength(1);
    expect(run({ ...options, preferredDeciles: [] }).candidates).toHaveLength(1);
    expect(run({ ...options, enabled: false, preferredDeciles: [{ index: 2, weight: 0 }] }).candidates).toHaveLength(1);
  });

  it("blocks zero weights and missing thresholds before any attempts without substituting evidence", () => {
    for (const bias of [{ ...options, preferredDeciles: [{ index: 5, weight: 0 }] }, { ...options, deciles: undefined }]) {
      const result = run(bias);
      expect(result.candidates).toHaveLength(0);
      expect(result.rejectionStats.totalAttempts).toBe(0);
      expect(result.quotaWarning).toBeTruthy();
      expect(result.trace).toContain("Generation blocked");
    }
  });

  it("calculates candidate OGA using the same full-history reference as the band cutoffs", () => {
    const fullHistory: Draw[] = [...history, { date: "2026-10-05", main: [10, 11, 12, 13, 14, 15], supp: [16, 17] }];
    vi.mocked(computeOGA).mockImplementation((_numbers, baseline) => baseline === fullHistory ? 9 : 4.5);
    const result = run({ ...options, baselineHistory: fullHistory, baselineLabel: "Full History (2 real draws)", preferredDeciles: [{ index: 9, weight: 1 }] });
    expect(result.candidates).toHaveLength(1);
    expect(vi.mocked(computeOGA).mock.calls.some((call) => call[1] === fullHistory)).toBe(true);
    expect(result.trace).toContain("reference Full History (2 real draws)");
  });
});
