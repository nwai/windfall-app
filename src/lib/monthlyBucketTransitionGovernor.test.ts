import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildMonthlyBucketTransitionGovernorProfile, monthlyBucketTransitionGovernorMultiplier, monthlyTransitionEvidenceQualifies, normalizeMonthlyBucketTransitionGovernorMode, type MonthlyBucketTransitionGovernorEvidence } from "./monthlyBucketTransitionGovernor";
import type { MonthlyBucketSets } from "./monthlyDrawSummary";

const bucketSets = (entries: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => ({
  undrawn: new Set(entries.undrawn ?? []),
  times1: new Set(entries.times1 ?? []),
  times2: new Set(entries.times2 ?? []),
  times3: new Set(entries.times3 ?? []),
  times4: new Set(entries.times4 ?? []),
  times5: new Set(entries.times5 ?? []),
  times6: new Set(entries.times6 ?? []),
  times7: new Set(entries.times7 ?? []),
  times8: new Set(entries.times8 ?? []),
});

const draw = (date: string, numbers: number[]): Draw => ({
  date,
  main: numbers.slice(0, 6),
  supp: numbers.slice(6, 8),
});

const completeMonth = (
  monthLabel: string,
  specialByDraw: Record<number, number[]>,
  reserved: number[],
): Draw[] => {
  const filler = Array.from({ length: 45 }, (_, index) => index + 1)
    .filter((number) => !reserved.includes(number));
  const [year, month] = monthLabel.split("-").map(Number);
  const dates = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => new Date(year, month - 1, index + 1))
    .filter((date) => [1, 3, 5].includes(date.getDay()));
  return dates.map((date, index) => {
    const drawOrdinal = index + 1;
    const special = specialByDraw[drawOrdinal] ?? [];
    const start = (index * 8) % filler.length;
    const fill = Array.from({ length: 16 }, (_, offset) => filler[(start + offset) % filler.length])
      .filter((number) => !special.includes(number));
    const numbers = [...special, ...fill].slice(0, 8);
    return draw(`${monthLabel}-${String(date.getDate()).padStart(2, "0")}`, numbers);
  });
};

const historyWithRepeatedTransition = (signalNumber: number, hitDrawOrdinal: number): Draw[] => [
  ...completeMonth("2026-01", { 1: [signalNumber], 3: [signalNumber], 5: [signalNumber], [hitDrawOrdinal]: [signalNumber] }, [signalNumber]),
  ...completeMonth("2026-04", { 1: [signalNumber], 3: [signalNumber], 5: [signalNumber], [hitDrawOrdinal]: [signalNumber] }, [signalNumber]),
  ...completeMonth("2026-06", { 1: [signalNumber], 3: [signalNumber], 5: [signalNumber], [hitDrawOrdinal]: [signalNumber] }, [signalNumber]),
];

describe("Monthly Bucket Transition Governor", () => {
  const manualOptions = {
    history: [], monthlyBuckets: bucketSets({ times3: [17, 22], undrawn: [3] }),
    targetMonthLabel: "2026-09", targetDrawOrdinal: 8, targetMonthExpectedDrawCount: 13,
  };

  it.each([['light', 1.1], ['normal', 1.25], ['strong', 1.4]] as const)("applies manual %s transparently even when Auto lacks evidence", (mode, multiplier) => {
    const auto = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, mode: "auto" });
    const profile = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, mode });
    expect(auto.active).toBe(false);
    expect(profile.mode).toBe(mode);
    expect(profile.internalStrength).toBe(mode);
    expect(profile.contextLabel).toBe("2026-09 13D D8");
    expect(profile.boostedNumbers).toEqual([17, 22]);
    expect(profile.checkedRules[0].evidenceGatePassed).toBe(false);
    expect(profile.checkedRules[0].evidence.trials).toBe(0);
    expect(profile.traceLabel).toContain(`manual ${mode}`);
    expect(profile.traceLabel).toContain("not passed (bypassed)");
    expect(monthlyBucketTransitionGovernorMultiplier(17, profile)).toBe(multiplier);
    expect(monthlyBucketTransitionGovernorMultiplier(22, profile)).toBe(multiplier);
    expect(monthlyBucketTransitionGovernorMultiplier(3, profile)).toBe(1);
  });

  it("does not manufacture a source bucket or override stage applicability in manual mode", () => {
    for (const patch of [
      { targetDrawOrdinal: 6 }, { targetDrawOrdinal: 10 }, { targetDrawOrdinal: 14 },
      { targetMonthLabel: "2026-99" }, { targetDrawOrdinal: NaN },
      { monthlyBuckets: null }, { monthlyBuckets: bucketSets({ undrawn: [17] }) },
      { monthlyBuckets: bucketSets({ times3: [17], times4: [9] }) },
      { monthlyBuckets: bucketSets({ times3: [17], times5: [9] }) },
    ]) {
      const profile = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, ...patch, mode: "strong" });
      expect(profile.active).toBe(false);
      expect(profile.internalStrength).toBe("off");
      expect(profile.boostedNumbers).toEqual([]);
      expect(Object.values(profile.numberMultipliers).every((weight) => weight === 1)).toBe(true);
    }
  });

  it("keeps fixed manual weights as new history arrives and records only prior-month evidence", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, mode: "normal", history: historyWithRepeatedTransition(17, 8) });
    const future = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, mode: "normal", targetMonthLabel: "2025-12", history: historyWithRepeatedTransition(17, 8) });
    expect(profile.checkedRules[0].evidenceGatePassed).toBe(true);
    expect(profile.numberMultipliers[17]).toBe(1.25);
    expect(future.checkedRules[0].evidence.trials).toBe(0);
    expect(future.traceLabel).toContain("User-selected normal experiment");
  });

  it.each([3, 4, 5])("supports manual early 2x to 3x at D%s", (targetDrawOrdinal) => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({ ...manualOptions, mode: "light", targetDrawOrdinal, monthlyBuckets: bucketSets({ times2: [12], times3: [17] }) });
    expect(profile.boostedNumbers).toEqual([12]);
    expect(profile.numberMultipliers[12]).toBe(1.1);
  });

  it("normalizes invalid or older stored modes to Off", () => {
    for (const mode of [undefined, null, "invalid", "manual", 1]) expect(normalizeMonthlyBucketTransitionGovernorMode(mode)).toBe("off");
    for (const mode of ["off", "auto", "light", "normal", "strong"]) expect(normalizeMonthlyBucketTransitionGovernorMode(mode)).toBe(mode);
  });
  it("requires conditional next-draw and per-number lift", () => {
    const evidence: MonthlyBucketTransitionGovernorEvidence = {
      trials: 12, sourceExposure: 60, hits: 12, atLeastOneHits: 6,
      atLeastOneRate: 0.5, expectedRandomAtLeastOneRate: 0.6, atLeastOneLift: 0.5 / 0.6,
      perNumberRate: 0.2, expectedRandomPerNumberRate: 8 / 45, perNumberLift: 0.2 / (8 / 45),
    };
    expect(monthlyTransitionEvidenceQualifies(evidence)).toBe(false);
    expect(monthlyTransitionEvidenceQualifies({ ...evidence, atLeastOneRate: 0.8, atLeastOneLift: 0.8 / 0.6 })).toBe(true);
    expect(monthlyTransitionEvidenceQualifies({ ...evidence, atLeastOneRate: 0.8, atLeastOneLift: 0.8 / 0.6, perNumberLift: 0.9 })).toBe(false);
    expect(monthlyTransitionEvidenceQualifies({ ...evidence, trials: 2, atLeastOneRate: 1, atLeastOneLift: 2 })).toBe(false);
  });

  it("cannot learn from future months or use an unspecified target ordinal", () => {
    const options = { mode: "auto" as const, history: historyWithRepeatedTransition(17, 8), monthlyBuckets: bucketSets({ times3: [17] }), targetMonthLabel: "2025-12", targetDrawOrdinal: 8, targetMonthExpectedDrawCount: 13 };
    expect(buildMonthlyBucketTransitionGovernorProfile(options).active).toBe(false);
    expect(buildMonthlyBucketTransitionGovernorProfile({ ...options, targetDrawOrdinal: undefined }).summaryLabel).toBe("Auto · unavailable");
  });
  it("keeps off mode neutral", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({
      mode: "off",
      history: historyWithRepeatedTransition(17, 8),
      monthlyBuckets: bucketSets({ times3: [17] }),
      targetMonthLabel: "2026-09",
      targetDrawOrdinal: 8,
      targetMonthExpectedDrawCount: 13,
    });

    expect(profile.userEnabled).toBe(false);
    expect(profile.active).toBe(false);
    expect(profile.summaryLabel).toBe("Off");
    expect(monthlyBucketTransitionGovernorMultiplier(17, profile)).toBe(1);
  });

  it("softly boosts current 3x numbers when delayed first-4x evidence is positive", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({
      mode: "auto",
      history: historyWithRepeatedTransition(17, 8),
      monthlyBuckets: bucketSets({ times3: [17, 22], undrawn: [1, 2, 3] }),
      targetMonthLabel: "2026-09",
      targetDrawOrdinal: 8,
      targetMonthExpectedDrawCount: 13,
    });

    expect(profile.userEnabled).toBe(true);
    expect(profile.active).toBe(true);
    expect(profile.activeRules.map((rule) => rule.rule)).toContain("three-to-four");
    expect(profile.boostedNumbers).toEqual([17, 22]);
    expect(monthlyBucketTransitionGovernorMultiplier(17, profile)).toBeGreaterThan(1);
    expect(monthlyBucketTransitionGovernorMultiplier(22, profile)).toBeGreaterThan(1);
    expect(monthlyBucketTransitionGovernorMultiplier(3, profile)).toBe(1);
    expect(profile.traceLabel).toContain("Delayed first 4x transition");
    expect(profile.traceLabel).toContain("soft weights");
    expect(profile.traceLabel).not.toMatch(/guarantee|probability/i);
  });

  it("does not activate the delayed first-4x rule after a current 4x bucket already exists", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({
      mode: "auto",
      history: historyWithRepeatedTransition(17, 8),
      monthlyBuckets: bucketSets({ times3: [17], times4: [9] }),
      targetMonthLabel: "2026-09",
      targetDrawOrdinal: 8,
      targetMonthExpectedDrawCount: 13,
    });

    expect(profile.userEnabled).toBe(true);
    expect(profile.active).toBe(false);
    expect(profile.summaryLabel).toBe("Auto · observe-only");
    expect(profile.traceLabel).toContain("4x-or-higher bucket already exists");
  });

  it("can softly boost 2x numbers during early 3x formation stages", () => {
    const profile = buildMonthlyBucketTransitionGovernorProfile({
      mode: "auto",
      history: historyWithRepeatedTransition(11, 5),
      monthlyBuckets: bucketSets({ times2: [11, 12] }),
      targetMonthLabel: "2026-09",
      targetDrawOrdinal: 5,
      targetMonthExpectedDrawCount: 13,
    });

    expect(profile.active).toBe(true);
    expect(profile.activeRules.map((rule) => rule.rule)).toContain("two-to-three");
    expect(profile.boostedNumbers).toEqual([11, 12]);
    expect(monthlyBucketTransitionGovernorMultiplier(11, profile)).toBeGreaterThan(1);
  });
});
