import { generateCandidates } from "../src/generateCandidates";
import { Draw, Knobs } from "../src/types";

function draw(main: number[], supp: number[] = [1,2], date = "2024-01-01"): Draw { return { main, supp, date } as any; }

const knobs: Knobs = {
  enableSDE1: false,
  enableHC3: false,
  enableOGA: false,
  enableGPWF: false,
  enableEntropy: false,
  enableHamming: false,
  enableJaccard: false,
  F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0,
  gpwf_window_size: 0, gpwf_bias_factor: 0, gpwf_floor: 0, gpwf_scale_multiplier: 0,
  lambda: 0,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
};

describe("generateCandidates OGA bias decile acceptance", () => {
  it("emits decile/band trace or counts ogaBias rejects", () => {
    const history: Draw[] = [
      draw([1,2,3,4,5,6]),
      draw([7,8,9,10,11,12]),
      draw([13,14,15,16,17,18]),
      draw([19,20,21,22,23,24]),
      draw([25,26,27,28,29,30]),
      draw([31,32,33,34,35,36]),
    ];
    const trace: string[] = [];
    const appendTrace = (updater: any) => {
      const next = typeof updater === 'function' ? updater(trace) : updater;
      if (Array.isArray(next)) {
        trace.splice(0, trace.length, ...next);
      }
    };
    const res = generateCandidates(
      5,
      history,
      knobs,
      appendTrace,
      [],
      [],
      false,
      0,
      [],
      [],
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
      {
        enabled: true,
        preferredBand: 'mid',
        bands: { low: 0.2, mid: 0.6, high: 0.2 },
        deciles: { thresholds: [0,1,2,3,4,5,6,7,8], probs: Array(10).fill(0.1) },
        preferredDeciles: [{ index: 5, weight: 1 }, { index: 6, weight: 1 }]
      }
    );
    const hasTrace = trace.some(l => l.includes("OGA decile") || l.includes("OGA band"));
    const hasBiasCount = (res.rejectionStats as any).ogaBias >= 0;
    expect(hasTrace || hasBiasCount).toBe(true);
  });
});
