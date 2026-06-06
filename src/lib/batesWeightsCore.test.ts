import { describe, expect, it } from "vitest";

import {
  DEFAULT_BATES_PARAMETERS,
  computeBatesWeights,
  normalizeBatesParameters,
  type BatesParameterSet,
} from "./batesWeightsCore";

function expectNormalizedWeights(weights: number[]) {
  expect(weights).toHaveLength(45);
  expect(weights.every((weight) => Number.isFinite(weight) && weight >= 0)).toBe(true);
  expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
}

describe("normalizeBatesParameters", () => {
  it("replaces non-finite and out-of-range values before any weight math runs", () => {
    const normalized = normalizeBatesParameters({
      ...DEFAULT_BATES_PARAMETERS,
      k: Number.NaN,
      triMode: -3,
      triMode2: Number.POSITIVE_INFINITY,
      dualTriWeightA: 4,
      mixWeight: -2,
      betaHot: Number.NaN,
      betaCold: 99,
      betaGlobal: Number.NEGATIVE_INFINITY,
      gammaConditional: 99,
      hotQuantile: 0.2,
      coldQuantile: 0.9,
    } as BatesParameterSet);

    expect(normalized.k).toBe(DEFAULT_BATES_PARAMETERS.k);
    expect(normalized.triMode).toBe(0);
    expect(normalized.triMode2).toBe(DEFAULT_BATES_PARAMETERS.triMode2);
    expect(normalized.dualTriWeightA).toBe(1);
    expect(normalized.mixWeight).toBe(0);
    expect(normalized.betaHot).toBe(DEFAULT_BATES_PARAMETERS.betaHot);
    expect(normalized.betaCold).toBe(3);
    expect(normalized.betaGlobal).toBe(DEFAULT_BATES_PARAMETERS.betaGlobal);
    expect(normalized.gammaConditional).toBe(3);
    expect(normalized.hotQuantile - normalized.coldQuantile).toBeGreaterThanOrEqual(0.05);
  });
});

describe("computeBatesWeights", () => {
  it("returns finite non-negative normalized weights with extreme modulation inputs", () => {
    const recentSignal = Array.from({ length: 45 }, (_, index) => (index === 0 ? -1000 : index === 44 ? 1000 : index));
    const conditionalProb = Array.from({ length: 45 }, (_, index) => (index % 2 === 0 ? 100 : -100));
    const result = computeBatesWeights(
      {
        ...DEFAULT_BATES_PARAMETERS,
        k: 200,
        mixWeight: 2,
        betaHot: 3,
        betaCold: 3,
        betaGlobal: 2,
        gammaConditional: 3,
      },
      { recentSignal, conditionalProb },
    );

    expect(result.normalizedParams.k).toBe(60);
    expectNormalizedWeights(result.finalWeights);
    expectNormalizedWeights(result.triWeights);
    expectNormalizedWeights(result.batesWeights);
    expectNormalizedWeights(result.baseConvex);
  });
});
