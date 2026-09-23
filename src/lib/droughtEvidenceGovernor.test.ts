import { describe, expect, it } from "vitest";

import { buildDroughtEvidenceGovernorProfile, droughtEvidenceGovernorMultiplier, normalizeDroughtEvidenceGovernorSettings } from "./droughtEvidenceGovernor";
import type { MonthlyBucketSets } from "./monthlyDrawSummary";
import type {
  EmpiricalDroughtQuotaAdvice,
  EmpiricalDroughtQuotaShortlist,
  StrictDroughtQuotaAdvice,
  StrictDroughtQuotaShortlist,
} from "./strictDroughtQuotaAdvice";

const buckets = (): MonthlyBucketSets => ({
  undrawn: new Set([7, 21, 33]),
  times1: new Set([8, 20, 34]),
  times2: new Set([9, 22, 35]),
  times3: new Set([]),
  times4: new Set([]),
  times5: new Set([]),
  times6: new Set([]),
  times7: new Set([]),
  times8: new Set([]),
});

const strictAdvice = (overrides: Partial<StrictDroughtQuotaAdvice> = {}): StrictDroughtQuotaAdvice => ({
  shouldApplyQuota: true,
  recommendedMinCount: 1,
  confidence: "moderate",
  source: "draw-ordinal",
  sourceLabel: "All D4 rows",
  reason: "Positive no-lookahead strict replay.",
  traceLabel: "Strict drought quota advice",
  trials: 24,
  averageHits: 1.7,
  expectedRandomAverageHits: 1.42,
  oneToThreeHitRate: 0.88,
  expectedRandomOneToThreeHitRate: 0.8,
  oneToThreeLift: 0.08,
  zeroHitRate: 0.04,
  expectedRandomZeroHitRate: 0.18,
  distribution: { "0": 1, "1": 12, "2": 9, "3": 2, "4+": 0 },
  countSummaries: [],
  ...overrides,
});

const empiricalAdvice = (overrides: Partial<EmpiricalDroughtQuotaAdvice> = {}): EmpiricalDroughtQuotaAdvice => ({
  shouldApplyQuota: true,
  recommendedMinCount: 1,
  confidence: "moderate",
  source: "all-baseline",
  sourceLabel: "All empirical hazard replay rows",
  reason: "Positive no-lookahead empirical replay.",
  traceLabel: "Empirical drought quota advice",
  trials: 90,
  averageHits: 1.65,
  expectedRandomAverageHits: 1.42,
  oneToThreeHitRate: 0.84,
  expectedRandomOneToThreeHitRate: 0.8,
  oneToThreeLift: 0.04,
  zeroHitRate: 0.06,
  expectedRandomZeroHitRate: 0.18,
  countSummaries: [],
  ...overrides,
});

const strictRow = (number: number, currentDrought: number, strictRank: number) => ({
  number,
  k: currentDrought,
  p: 0.2,
  rawProbability: 0.2,
  trials: 10,
  hitsNext: 2,
  liftVsBaseline: 0.02,
  activeWindowDrought: currentDrought,
  currentDrought,
  hasAppearedInFullHistory: true,
  historicalDroughtEpisodes: 3,
  medianBreakLength: 8,
  p75BreakLength: 11,
  longestBreakLength: 14,
  breakTimingScore: 75,
  episodeFrequencyScore: 60,
  currentDroughtScore: currentDrought * 1000,
  strictScore: currentDrought * 1000 + 135,
  strictRank,
  strictEligible: true,
});

const empiricalRow = (number: number, drought: number, p: number, trials: number) => ({
  number,
  k: drought,
  p,
  rawProbability: p,
  trials,
  hitsNext: Math.round(p * trials),
  liftVsBaseline: p - 8 / 45,
});

const strictShortlist: StrictDroughtQuotaShortlist = {
  threshold: 6,
  topK: 4,
  rows: [
    strictRow(7, 12, 1),
    strictRow(21, 11, 2),
    strictRow(33, 10, 3),
    strictRow(9, 8, 4),
  ],
  numbers: [7, 21, 33, 9],
  rankMultipliers: { 7: 2, 21: 1.75, 33: 1.5, 9: 1.25 },
};

const empiricalShortlist: EmpiricalDroughtQuotaShortlist = {
  topK: 4,
  rows: [
    empiricalRow(20, 9, 0.24, 25),
    empiricalRow(21, 11, 0.22, 18),
    empiricalRow(34, 7, 0.2, 16),
    empiricalRow(35, 6, 0.19, 14),
  ],
  numbers: [20, 21, 34, 35],
  rankMultipliers: { 20: 2, 21: 1.75, 34: 1.5, 35: 1.25 },
};

const build = (overrides: Partial<Parameters<typeof buildDroughtEvidenceGovernorProfile>[0]> = {}) => buildDroughtEvidenceGovernorProfile({
  mode: "auto",
  strictAdvice: strictAdvice(),
  strictShortlist,
  strictEligibleNumbers: strictShortlist.numbers,
  empiricalAdvice: empiricalAdvice(),
  empiricalShortlist,
  empiricalEligibleNumbers: empiricalShortlist.numbers,
  monthlyBuckets: buckets(),
  carryOverNumbers: [7, 20],
  targetMonthLabel: "2026-09",
  targetDrawOrdinal: 4,
  targetMonthExpectedDrawCount: 13,
  ...overrides,
});

describe("Drought Evidence Governor", () => {
  it("keeps off mode neutral", () => {
    const profile = build({ mode: "off" });

    expect(profile.userEnabled).toBe(false);
    expect(profile.active).toBe(false);
    expect(droughtEvidenceGovernorMultiplier(7, profile)).toBe(1);
    expect(profile.traceLabel).toContain("off");
  });

  it("activates strict and empirical soft boosts when both replays beat the baseline gate", () => {
    const profile = build();

    expect(profile.active).toBe(true);
    expect(profile.activeFamilies).toEqual(["strict", "empirical"]);
    expect(profile.boostedNumbers).toContain(7);
    expect(profile.boostedNumbers).toContain(20);
    expect(profile.boostedNumbers).toContain(21);
    expect(profile.numberDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        number: 7,
        families: ["strict"],
        strictRank: 1,
        strictDrought: 12,
        bucketLabel: "0x",
        carriedOver: true,
      }),
      expect.objectContaining({
        number: 21,
        families: ["strict", "empirical"],
        strictRank: 2,
        strictDrought: 11,
        empiricalRank: 2,
        empiricalDrought: 11,
      }),
    ]));
    expect(droughtEvidenceGovernorMultiplier(7, profile)).toBeGreaterThan(1);
    expect(droughtEvidenceGovernorMultiplier(21, profile)).toBeGreaterThan(1);
    expect(droughtEvidenceGovernorMultiplier(1, profile)).toBe(1);
    expect(Math.max(...Object.values(profile.numberMultipliers))).toBeLessThanOrEqual(1.45);
    expect(profile.traceLabel).toContain("Drought Evidence Governor auto");
    expect(profile.traceLabel).toContain("carry-over overlap numbers: 7, 20 (count 2)");
    expect(profile.traceLabel).not.toMatch(/probability|guarantee/i);
  });

  it("stays observe-only when replay evidence does not clear the no-lookahead gate", () => {
    const profile = build({
      strictAdvice: strictAdvice({
        shouldApplyQuota: false,
        oneToThreeLift: -0.01,
        averageHits: 1.1,
        expectedRandomAverageHits: 1.42,
      }),
      empiricalAdvice: empiricalAdvice({
        shouldApplyQuota: false,
        oneToThreeLift: 0.01,
        averageHits: 1.43,
        expectedRandomAverageHits: 1.42,
      }),
    });

    expect(profile.userEnabled).toBe(true);
    expect(profile.active).toBe(false);
    expect(profile.summaryLabel).toBe("Auto · no boost applied");
    expect(profile.boostedNumbers).toEqual([]);
    expect(droughtEvidenceGovernorMultiplier(7, profile)).toBe(1);
    expect(profile.traceLabel).toContain("strict gate not passed");
  });

  it("uses manual family weights even when the Auto gate fails, without claiming evidence support", () => {
    const profile = build({ mode: "manual", strictAdvice: strictAdvice({ shouldApplyQuota: false }),
      empiricalAdvice: empiricalAdvice({ shouldApplyQuota: false }),
      settings: { strictMultiplier: 1.2, empiricalMultiplier: 1.3 } });
    expect(profile.numberMultipliers[7]).toBe(1.2);
    expect(profile.numberMultipliers[20]).toBe(1.3);
    expect(profile.numberMultipliers[21]).toBe(1.45);
    expect(profile.familySummaries.every((family) => !family.gatePassed)).toBe(true);
    expect(profile.traceLabel).toContain("Manual experiment: Auto gate is bypassed");
    expect(build({ mode: "manual" }).active).toBe(false);
  });

  it("keeps bucket counts factual while independently limiting the two weighting families", () => {
    const profile = build({ mode: "manual", settings: {
      strictBuckets: ["undrawn"], empiricalBuckets: ["times1"], strictMultiplier: 1.2, empiricalMultiplier: 1.3,
    } });
    expect(profile.numberMultipliers[21]).toBe(1.2);
    expect(profile.numberMultipliers[20]).toBe(1.3);
    expect(profile.numberMultipliers[9]).toBe(1);
    expect(profile.numberMultipliers[35]).toBe(1);
    expect(profile.familySummaries[0].bucketCounts).toEqual({ "0x": 3, "2x": 1 });
    expect(profile.familySummaries[0].allowedNumbers).toEqual([7, 21, 33]);
    expect(build({ settings: { strictBuckets: [], empiricalBuckets: [] } }).active).toBe(false);
    expect(build({ monthlyBuckets: null }).active).toBe(false);
  });

  it("turns carry-over weighting off without hiding the overlap or excluding those numbers globally", () => {
    for (const mode of ["auto", "manual"] as const) {
      const profile = build({ mode, settings: { carryOverEnabled: false, strictMultiplier: 1.2, empiricalMultiplier: 1.2, numberOverrides: { 7: 1.45 } } });
      expect(profile.numberMultipliers[7]).toBe(1);
      expect(profile.numberMultipliers[20]).toBe(1);
      expect(profile.numberMultipliers[21]).toBeGreaterThan(1);
      expect(profile.carryOverNumbers).toEqual([7, 20]);
      expect(profile.traceLabel).toContain("weight carry-over numbers OFF");
    }
  });

  it("applies exact per-number overrides only in Manual and only to allowed shortlist numbers", () => {
    const settings = { strictMultiplier: 1.2, empiricalMultiplier: 1.3, numberOverrides: { 21: 1.17, 7: 1, 1: 1.45 } };
    const profile = build({ mode: "manual", settings });
    expect(profile.numberMultipliers[21]).toBe(1.17);
    expect(profile.numberMultipliers[7]).toBe(1);
    expect(profile.numberMultipliers[1]).toBe(1);
    expect(build({ mode: "auto", settings }).numberMultipliers).toEqual(build().numberMultipliers);
    expect(Object.values(build({ mode: "off", settings }).numberMultipliers).every((weight) => weight === 1)).toBe(true);
    expect(build({ mode: "manual", settings, strictEligibleNumbers: [], empiricalEligibleNumbers: [] }).active).toBe(false);
  });

  it("refreshes eligibility and planning context when a number changes bucket", () => {
    const settings = { strictBuckets: ["undrawn" as const], empiricalBuckets: [], strictMultiplier: 1.2, numberOverrides: { 7: 1.4 } };
    expect(build({ mode: "manual", settings }).numberMultipliers[7]).toBe(1.4);
    const updated = buckets();
    updated.undrawn.delete(7);
    updated.times1.add(7);
    const next = build({ mode: "manual", settings, monthlyBuckets: updated, targetDrawOrdinal: 5 });
    expect(next.numberMultipliers[7]).toBe(1);
    expect(next.contextLabel).toBe("2026-09 13D D5");
    expect(next.settings.numberOverrides[7]).toBe(1.4);
  });

  it("sanitizes invalid stored weights and preserves intentionally empty bucket selections", () => {
    const settings = normalizeDroughtEvidenceGovernorSettings({ strictBuckets: [], empiricalBuckets: ["times1", "bad", "times1"],
      strictMultiplier: Infinity, empiricalMultiplier: 5, carryOverEnabled: false,
      numberOverrides: { 0: 1.2, 7: 9, 21: -1, 22: NaN, 46: 1.2, 33: 1.234, 34: "1.2" } });
    expect(settings).toEqual({ strictBuckets: [], empiricalBuckets: ["times1"], strictMultiplier: 1,
      empiricalMultiplier: 1.45, carryOverEnabled: false, numberOverrides: { 7: 1.45, 21: 1, 33: 1.23 } });
  });
});
