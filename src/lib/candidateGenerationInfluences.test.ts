import { describe, expect, it } from "vitest";

import {
  buildGenerationProvenance,
  normalizeReadinessWeights,
  normalizeSumFilter,
  summarizeAcceptanceNeeds,
} from "./candidateGenerationInfluences";

describe("normalizeSumFilter", () => {
  it("keeps valid enabled sum filters active for generation", () => {
    const normalized = normalizeSumFilter({ enabled: true, min: 110, max: 170, includeSupp: false });

    expect(normalized.config).toEqual({ enabled: true, min: 110, max: 170, includeSupp: false });
    expect(normalized.label).toBe("110-170 main");
    expect(normalized.warnings).toEqual([]);
  });

  it("repairs reversed bounds rather than silently disabling the filter", () => {
    const normalized = normalizeSumFilter({ enabled: true, min: 190, max: 120, includeSupp: true });

    expect(normalized.config).toEqual({ enabled: true, min: 120, max: 190, includeSupp: true });
    expect(normalized.label).toBe("120-190 main+supp");
    expect(normalized.warnings).toEqual(["Sum filter bounds were reversed and have been corrected."]);
  });

  it("disables impossible or non-finite sum filters with a warning", () => {
    const normalized = normalizeSumFilter({ enabled: true, min: Number.NaN, max: 200, includeSupp: true });

    expect(normalized.config.enabled).toBe(false);
    expect(normalized.label).toBe("off");
    expect(normalized.warnings).toEqual(["Sum filter is disabled because one or both bounds are not finite numbers."]);
  });
});

describe("summarizeAcceptanceNeeds", () => {
  it("flags monthly acceptance requirements that exceed the eight-number candidate size", () => {
    const summary = summarizeAcceptanceNeeds({
      undrawn: 2,
      times1: 2,
      times2: 2,
      times3: 2,
      times4: 1,
      times5: 0,
      times6: 0,
      times7: 0,
      times8: 0,
    });

    expect(summary.total).toBe(9);
    expect(summary.possible).toBe(false);
    expect(summary.warning).toBe("Requirements sum to 9, but candidates contain only 8 numbers.");
  });
});

describe("normalizeReadinessWeights", () => {
  it("normalizes finite positive weights and falls back safely when all are zero", () => {
    expect(normalizeReadinessWeights({ idm: 0.7, conv: 0.1, oga: 0.2 })).toEqual({
      idm: 70,
      conv: 10,
      oga: 20,
    });

    expect(normalizeReadinessWeights({ idm: 0, conv: 0, oga: 0 })).toEqual({
      idm: 0,
      conv: 0,
      oga: 0,
    });
  });

  it("uses largest-remainder rounding so active percentages sum to one hundred", () => {
    const weights = normalizeReadinessWeights({ idm: 1, conv: 1, oga: 1 });

    expect(weights).toEqual({ idm: 34, conv: 33, oga: 33 });
    expect(weights.idm + weights.conv + weights.oga).toBe(100);
  });
});

describe("buildGenerationProvenance", () => {
  it("builds readable provenance without leaking template syntax", () => {
    const provenance = buildGenerationProvenance({
      windowSize: 314,
      entropy: "off",
      hamming: 3,
      jaccard: "off",
      tricky: false,
      ratios: ["4:4", "5:3"],
      minRecentMatches: 1,
      recentMatchBias: 0.5,
      repeatWindowSizeW: 12,
      minFromRecentUnionM: 2,
      gpwf: true,
      lambda: 0.85,
      sumLabel: "120-190 main+supp",
      patternMode: "restrict",
      patternSumTolerance: 1,
      patternBoostFactor: 0.15,
      ogaBias: "auto @ window",
      endingDigitSets: {
        end0: "off",
        end1: "max 1",
        end2: "off",
        end3: "off",
        end4: "off",
        end5: "off",
        end6: "off",
        end7: "off",
        end8: "off",
        end9: "off",
      },
      digitWidth: "0/100 mains => 0/6",
      endingDigitBoosts: "bucket 1 (single-digit +2)",
      decadeBias: "0x:+1",
      monthlyRepeatBias: "ON budget:1.0/6",
    });

    expect(provenance).toContain("Sum=120-190 main+supp");
    expect(provenance).toContain("End1Set=max 1");
    expect(provenance).not.toContain("$");
    expect(provenance).not.toContain("${");
  });
});
