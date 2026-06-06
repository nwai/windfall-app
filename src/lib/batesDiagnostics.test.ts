import { describe, expect, it } from "vitest";

import { DEFAULT_BATES_PARAMETERS } from "./batesWeightsCore";
import { computeBatesDiagnostics } from "./batesDiagnostics";

describe("computeBatesDiagnostics", () => {
  it("normalizes malformed weight vectors before reporting distribution statistics", () => {
    const diagnostics = computeBatesDiagnostics(
      DEFAULT_BATES_PARAMETERS,
      [2, Number.NaN, Number.POSITIVE_INFINITY, -1, 3],
      {},
    );

    expect(diagnostics.weights.totalMass).toBeCloseTo(5, 10);
    expect(diagnostics.weights.invalidWeightCount).toBe(3);
    expect(diagnostics.weights.sourceLength).toBe(5);
    expect(diagnostics.weights.mean).toBeCloseTo(1 / 45, 10);
    expect(diagnostics.weights.top[0]).toMatchObject({ n: 5, w: 0.6 });
    expect(diagnostics.guardrails.severity).toBe("risk");
    expect(diagnostics.guardrails.warnings.some((warning) => warning.includes("invalid"))).toBe(true);
  });

  it("flags concentrated distributions using effective numbers and entropy", () => {
    const weights = Array.from({ length: 45 }, (_, index) => (index === 0 ? 0.9 : 0.1 / 44));
    const diagnostics = computeBatesDiagnostics(DEFAULT_BATES_PARAMETERS, weights, {});

    expect(diagnostics.weights.effectiveNumbers).toBeLessThan(2);
    expect(diagnostics.weights.entropyRatio).toBeLessThan(0.25);
    expect(diagnostics.weights.concentrationSeverity).toBe("risk");
    expect(diagnostics.guardrails.severity).toBe("risk");
    expect(diagnostics.guardrails.warnings.some((warning) => warning.includes("highly concentrated"))).toBe(true);
  });

  it("reports a uniform distribution as healthy", () => {
    const weights = Array.from({ length: 45 }, () => 1 / 45);
    const diagnostics = computeBatesDiagnostics(DEFAULT_BATES_PARAMETERS, weights, {});

    expect(diagnostics.weights.effectiveNumbers).toBeCloseTo(45, 10);
    expect(diagnostics.weights.entropyRatio).toBeCloseTo(1, 10);
    expect(diagnostics.weights.concentrationSeverity).toBe("ok");
    expect(diagnostics.guardrails.severity).toBe("ok");
    expect(diagnostics.guardrails.warnings).toEqual([]);
  });
});
