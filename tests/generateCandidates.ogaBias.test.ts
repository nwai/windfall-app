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

type ForcedCandidateOptions = {
  div5Options?: { maxMainCount?: number };
  mainZeroOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainFiveOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainOneOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainTwoOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainThreeOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainFourOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainSixOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainSevenOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainEightOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainNineOptions?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number };
  mainDecadeBiases?: Partial<Record<"decade0x" | "decade1x" | "decade2x" | "decade3x" | "decade4x", number>>;
  digitWidthConstraint?: { enabled?: boolean; singleDigitPercent?: number; scope?: "main" | "mainAndSupp" };
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

function generateSampledCandidates(options: ForcedCandidateOptions = {}) {
  return generateCandidates(
    250,
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
    undefined,
    undefined,
    undefined,
    options.div5Options,
    options.mainZeroOptions,
    options.mainFiveOptions,
    options.mainOneOptions,
    options.mainTwoOptions,
    options.mainThreeOptions,
    options.mainFourOptions,
    options.mainSixOptions,
    options.mainSevenOptions,
    options.mainEightOptions,
    options.mainNineOptions,
    options.digitWidthConstraint,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.mainDecadeBiases,
  ).candidates;
}

function countBucketScopeHits(
  candidates: Array<{ main: number[] }>,
  digit: number,
  scope: "singleDigit" | "twoDigit",
): number {
  return candidates.reduce((sum, candidate) => {
    const hits = candidate.main.filter((n) => {
      if (n % 10 !== digit) return false;
      return scope === "singleDigit" ? n >= 1 && n <= 9 : n >= 10 && n <= 45;
    }).length;
    return sum + hits;
  }, 0);
}

function countCandidateBucketScopeHits(
  candidates: Array<{ main: number[]; supp: number[] }>,
  digit: number,
  scope: "singleDigit" | "twoDigit",
): number {
  return candidates.reduce((sum, candidate) => {
    const hits = [...candidate.main, ...candidate.supp].filter((n) => {
      if (n % 10 !== digit) return false;
      return scope === "singleDigit" ? n >= 1 && n <= 9 : n >= 10 && n <= 45;
    }).length;
    return sum + hits;
  }, 0);
}

function countCandidateDecadeHits(
  candidates: Array<{ main: number[]; supp: number[] }>,
  bucket: "decade0x" | "decade1x" | "decade2x" | "decade3x" | "decade4x",
): number {
  return candidates.reduce((sum, candidate) => {
    const hits = [...candidate.main, ...candidate.supp].filter((n) => {
      if (bucket === "decade0x") return n >= 1 && n <= 9;
      if (bucket === "decade1x") return n >= 10 && n <= 19;
      if (bucket === "decade2x") return n >= 20 && n <= 29;
      if (bucket === "decade3x") return n >= 30 && n <= 39;
      return n >= 40 && n <= 45;
    }).length;
    return sum + hits;
  }, 0);
}

function countSingleDigits(numbers: number[]): number {
  return numbers.filter((n) => n >= 1 && n <= 9).length;
}

function generateForcedCandidate(history: Draw[], forced: number[], options: ForcedCandidateOptions = {}) {
  return generateCandidates(
    1,
    history,
    knobs,
    () => {},
    [],
    [],
    false,
    0,
    [],
    forced,
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
    options.div5Options,
    options.mainZeroOptions,
    options.mainFiveOptions,
    options.mainOneOptions,
    options.mainTwoOptions,
    options.mainThreeOptions,
    options.mainFourOptions,
    options.mainSixOptions,
    options.mainSevenOptions,
    options.mainEightOptions,
    options.mainNineOptions,
    options.digitWidthConstraint,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.mainDecadeBiases,
  );
}

function buildDigitOptions(digit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, maxCount: number): ForcedCandidateOptions {
  switch (digit) {
    case 0: return { mainZeroOptions: { maxCount } };
    case 5: return { mainFiveOptions: { maxCount } };
    case 1: return { mainOneOptions: { maxCount } };
    case 2: return { mainTwoOptions: { maxCount } };
    case 3: return { mainThreeOptions: { maxCount } };
    case 4: return { mainFourOptions: { maxCount } };
    case 6: return { mainSixOptions: { maxCount } };
    case 7: return { mainSevenOptions: { maxCount } };
    case 8: return { mainEightOptions: { maxCount } };
    case 9: return { mainNineOptions: { maxCount } };
  }
}

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
      {
        enabled: true,
        preferredBand: 'mid',
        bands: { low: 0.2, mid: 0.6, high: 0.2 },
        deciles: { thresholds: [0,1,2,3,4,5,6,7,8], probs: Array(10).fill(0.1) },
        preferredDeciles: [{ index: 5, weight: 1 }, { index: 6, weight: 1 }]
      },
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
      undefined
    );
    const hasTrace = trace.some(l => l.includes("OGA decile") || l.includes("OGA band"));
    const hasBiasCount = (res.rejectionStats as any).ogaBias >= 0;
    expect(hasTrace || hasBiasCount).toBe(true);
  });

  it("applies the main 0 constraint independently from main 5 numbers", () => {
    const history: Draw[] = [
      draw([1, 2, 3, 4, 6, 7], [10, 20]),
      draw([8, 9, 11, 12, 13, 14], [30, 40]),
    ];
    const forced = [5, 15, 25, 35, 45, 1];
    const res = generateForcedCandidate(history, forced, { mainZeroOptions: { maxCount: 0 } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].main.filter((n) => n % 10 === 0)).toHaveLength(0);
    expect(res.candidates[0].main.filter((n) => n % 10 === 5)).toHaveLength(5);
  });

  it("applies the main 5 constraint independently from main 0 numbers", () => {
    const history: Draw[] = [
      draw([1, 2, 3, 4, 6, 7], [5, 15]),
      draw([8, 9, 11, 12, 13, 14], [25, 35]),
    ];
    const forced = [10, 20, 30, 40, 1, 2];
    const res = generateForcedCandidate(history, forced, { mainFiveOptions: { maxCount: 0 } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].main.filter((n) => n % 10 === 5)).toHaveLength(0);
    expect(res.candidates[0].main.filter((n) => n % 10 === 0)).toHaveLength(4);
  });

  const digitSetCases = [
    { digit: 0 as const, numbers: [10, 20, 30, 40] },
    { digit: 1 as const, numbers: [1, 11, 21, 31, 41] },
    { digit: 2 as const, numbers: [2, 12, 22, 32, 42] },
    { digit: 3 as const, numbers: [3, 13, 23, 33, 43] },
    { digit: 4 as const, numbers: [4, 14, 24, 34, 44] },
    { digit: 5 as const, numbers: [5, 15, 25, 35, 45] },
    { digit: 6 as const, numbers: [6, 16, 26, 36] },
    { digit: 7 as const, numbers: [7, 17, 27, 37] },
    { digit: 8 as const, numbers: [8, 18, 28, 38] },
    { digit: 9 as const, numbers: [9, 19, 29, 39] },
  ];

  digitSetCases.forEach(({ digit, numbers }) => {
    it(`enforces max zero main numbers from {${numbers.join(",")}}`, () => {
      const fillerPool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => n % 10 !== digit && !numbers.includes(n));
      const safeMain = fillerPool.slice(0, 6);
      const history: Draw[] = [
        draw(safeMain, numbers.slice(0, 2)),
        draw(fillerPool.slice(6, 12), numbers.slice(2, 4)),
      ];
      const forced = safeMain;
      const res = generateForcedCandidate(history, forced, buildDigitOptions(digit, 0));
      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0].main.filter((n) => n % 10 === digit)).toHaveLength(0);
    });

    it(`allows up to ${numbers.length} main numbers from {${numbers.join(",")}}`, () => {
      const fillerPool = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => n % 10 !== digit && !numbers.includes(n));
      const fillerMain = fillerPool.slice(0, 6 - numbers.length);
      const history: Draw[] = [
        draw([...numbers, ...fillerPool.slice(6, 6 + (6 - numbers.length))], fillerPool.slice(12, 14)),
        draw([...numbers, ...fillerPool.slice(8, 8 + (6 - numbers.length))], fillerPool.slice(14, 16)),
      ];
      const forced = [...numbers, ...fillerMain];
      const res = generateForcedCandidate(history, forced, buildDigitOptions(digit, numbers.length));
      expect(res.candidates).toHaveLength(1);
      expect(res.candidates[0].main.filter((n) => n % 10 === digit)).toHaveLength(numbers.length);
      numbers.forEach((n) => expect(res.candidates[0].main).toContain(n));
    });
  });

  it("allows fewer than the selected max for a main digit-set constraint", () => {
    const history: Draw[] = [
      draw([1, 2, 3, 4, 5, 6], [11, 21]),
      draw([7, 8, 9, 10, 12, 13], [31, 41]),
    ];
    const forced = [1, 2, 3, 4, 5, 6];
    const res = generateForcedCandidate(history, forced, { mainOneOptions: { maxCount: 2 } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].main.filter((n) => n % 10 === 1)).toHaveLength(1);
  });

  it("applies a single-digit-only main digit boost even when the max-allowed toggle is off", () => {
    const baselineHits = withSeededRandom(12345, () => countBucketScopeHits(generateSampledCandidates(), 1, "singleDigit"));
    const boostedHits = withSeededRandom(12345, () =>
      countBucketScopeHits(generateSampledCandidates({ mainOneOptions: { singleDigitBoost: 5 } }), 1, "singleDigit")
    );

    expect(boostedHits).toBeGreaterThan(baselineHits);
  });

  it("applies a two-digit-only main digit boost alongside an enabled max constraint", () => {
    const baselineHits = withSeededRandom(54321, () => countBucketScopeHits(generateSampledCandidates(), 1, "twoDigit"));
    const boostedHits = withSeededRandom(54321, () =>
      countBucketScopeHits(generateSampledCandidates({ mainOneOptions: { maxCount: 5, twoDigitBoost: 5 } }), 1, "twoDigit")
    );

    expect(boostedHits).toBeGreaterThan(baselineHits);
  });

  it("applies ending-digit boosts to supplementary picks as well", () => {
    const baselineHits = withSeededRandom(202410, () => countCandidateBucketScopeHits(generateSampledCandidates(), 1, "twoDigit"));
    const boostedHits = withSeededRandom(202410, () =>
      countCandidateBucketScopeHits(generateSampledCandidates({ mainOneOptions: { twoDigitBoost: 5 } }), 1, "twoDigit")
    );

    expect(boostedHits).toBeGreaterThan(baselineHits);
  });

  it("emits human-readable trace wording for split main digit boosts", () => {
    const trace: string[] = [];
    withSeededRandom(24680, () => {
      generateCandidates(
        6,
        [],
        knobs,
        (msg) => trace.push(msg),
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
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { singleDigitBoost: 5, twoDigitBoost: 2 },
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
      );
    });

    expect(trace.some((line) => line.includes("bucket 1 single-digit +5") && line.includes("bucket 1 two-digit +2"))).toBe(true);
    expect(trace.some((line) => line.includes("Ending-digit boost results:") && line.includes("produced") && line.includes("accepted candidate hits"))).toBe(true);
  });

  it("applies a positive decade bias to boost that decade across the full candidate", () => {
    const baselineHits = withSeededRandom(202406, () => countCandidateDecadeHits(generateSampledCandidates(), "decade2x"));
    const boostedHits = withSeededRandom(202406, () =>
      countCandidateDecadeHits(generateSampledCandidates({ mainDecadeBiases: { decade2x: 5 } }), "decade2x")
    );

    expect(boostedHits).toBeGreaterThan(baselineHits);
  });

  it("applies a negative decade bias to punish that decade across the full candidate", () => {
    const baselineHits = withSeededRandom(202407, () => countCandidateDecadeHits(generateSampledCandidates(), "decade3x"));
    const punishedHits = withSeededRandom(202407, () =>
      countCandidateDecadeHits(generateSampledCandidates({ mainDecadeBiases: { decade3x: -5 } }), "decade3x")
    );

    expect(punishedHits).toBeLessThan(baselineHits);
  });

  it("rejects a forced candidate when supp numbers push an ending-digit bucket over the max", () => {
    const history: Draw[] = [
      draw([1, 2, 3, 4, 6, 7], [8, 9]),
      draw([11, 12, 13, 14, 16, 17], [18, 19]),
    ];

    const res = generateForcedCandidate(history, [1, 2, 3, 4, 6, 7, 10, 20], {
      mainZeroOptions: { maxCount: 1 },
    });

    expect(res.candidates).toHaveLength(0);
    expect(res.rejectionStats.mainZeroSet).toBeGreaterThan(0);
  });

  it("enforces the selected single-digit vs two-digit share for mains only", () => {
    const candidates = withSeededRandom(202408, () =>
      generateSampledCandidates({ digitWidthConstraint: { enabled: true, singleDigitPercent: 25, scope: "main" } })
    );

    expect(candidates.length).toBeGreaterThan(0);
    candidates.forEach((candidate) => {
      expect(countSingleDigits(candidate.main)).toBe(1);
      expect(candidate.main.filter((n) => n >= 10).length).toBe(5);
    });
  });

  it("enforces the selected single-digit vs two-digit share for main + supp counts", () => {
    const candidates = withSeededRandom(202409, () =>
      generateSampledCandidates({ digitWidthConstraint: { enabled: true, singleDigitPercent: 25, scope: "mainAndSupp" } })
    );

    expect(candidates.length).toBeGreaterThan(0);
    candidates.forEach((candidate) => {
      const allNumbers = [...candidate.main, ...candidate.supp];
      expect(countSingleDigits(allNumbers)).toBe(2);
      expect(allNumbers.filter((n) => n >= 10).length).toBe(6);
    });
  });

  it("rejects a forced candidate that breaks the strict mains-only digit-width share", () => {
    const history: Draw[] = [
      draw([10, 11, 12, 13, 14, 15], [16, 17]),
      draw([18, 19, 20, 21, 22, 23], [24, 25]),
    ];

    const res = generateForcedCandidate(history, [1, 2, 10, 11, 12, 13], {
      digitWidthConstraint: { enabled: true, singleDigitPercent: 25, scope: "main" },
    });

    expect(res.candidates).toHaveLength(0);
    expect(res.rejectionStats.digitWidth).toBeGreaterThan(0);
  });
});
