import { describe, expect, it } from "vitest";

import { generateCandidates } from "../src/generateCandidates";
import type { ScoringGenerationProfile } from "../src/lib/scoringGenerationInfluence";
import type { Knobs } from "../src/types";
import { buildDroughtEvidenceGovernorProfile, type DroughtEvidenceGovernorProfile } from "../src/lib/droughtEvidenceGovernor";
import { buildStrictDroughtQuotaAdvice, buildEmpiricalDroughtQuotaAdvice } from "../src/lib/strictDroughtQuotaAdvice";
import { buildMonthlyBucketTransitionGovernorProfile, type MonthlyBucketTransitionGovernorProfile } from "../src/lib/monthlyBucketTransitionGovernor";

const allBuckets = { undrawn: new Set(Array.from({ length: 45 }, (_, i) => i + 1)),
  times1: new Set<number>(), times2: new Set<number>(), times3: new Set<number>(), times4: new Set<number>(),
  times5: new Set<number>(), times6: new Set<number>(), times7: new Set<number>(), times8: new Set<number>() };
const manualGovernor = (carryOverEnabled = true) => buildDroughtEvidenceGovernorProfile({
  mode: "manual", settings: { strictMultiplier: 1.45, carryOverEnabled },
  strictAdvice: buildStrictDroughtQuotaAdvice([]), empiricalAdvice: buildEmpiricalDroughtQuotaAdvice([]),
  strictShortlist: { numbers: [21], rows: [], threshold: 6, topK: 8, rankMultipliers: {} },
  empiricalShortlist: { numbers: [], rows: [], topK: 8, rankMultipliers: {} },
  strictEligibleNumbers: [21], empiricalEligibleNumbers: [], monthlyBuckets: allBuckets, carryOverNumbers: [21],
});

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

const withSeededRandom = <T,>(seed: number, run: () => T): T => {
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
};

const scoringProfile: ScoringGenerationProfile = {
  enabled: true,
  influence: "strong",
  scope: "mains-plus-supps",
  numberScores: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, 45 - index])),
  numberMultipliers: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index + 1, index < 10 ? 2 : 0.75])),
  ratioScores: { "4:4": 300, "5:3": 240, "3:5": 216 },
  terminalDigitSetScores: { "0,1,2,3,4,5,6,7": 80, "1,2,3,4,5,6,7,8": 75 },
  straightRunScores: { "0,1,2,3,4,5,6,7": 25, "1,2,3,4,5,6,7,8": 20 },
  traceLabel: "Numbers diagnostic strong evidence weighting active; diagnostic support only.",
};

const runGenerator = (options: {
  num?: number;
  selectedRatios?: string[];
  ratioOptions?: { ratio: string; count: number; percent?: number }[];
  profile?: ScoringGenerationProfile;
  governor?: DroughtEvidenceGovernorProfile;
  monthlyTransition?: MonthlyBucketTransitionGovernorProfile;
  monthly?: boolean;
  excluded?: number[];
  forced?: number[];
  trace?: (line: string) => void;
} = {}) => withSeededRandom(20260618, () =>
  generateCandidates(
    options.num ?? 20,
    [],
    knobs,
    options.trace ?? (() => {}),
    options.excluded ?? [],
    options.selectedRatios ?? [],
    false,
    0,
    [],
    options.forced ?? [],
    [],
    undefined,
    0,
    0,
    1,
    0,
    options.ratioOptions ?? [],
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
    options.monthly ? { buckets: allBuckets, constraints: { undrawn: 8, times1: 0, times2: 0, times3: 0, times4: 0, times5: 0, times6: 0, times7: 0, times8: 0 } } : undefined,
    400,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.profile,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.governor,
    options.monthlyTransition,
  )
);

describe("generateCandidates scoring diagnostics influence", () => {
  it("uses manual monthly transition weights and preserves forced inclusions and exclusions", () => {
    const monthlyTransition = buildMonthlyBucketTransitionGovernorProfile({ mode: "strong", history: [],
      monthlyBuckets: { ...allBuckets, undrawn: new Set([...allBuckets.undrawn].filter((n) => n !== 17 && n !== 22)), times3: new Set([17, 22]) },
      targetMonthLabel: "2026-09", targetDrawOrdinal: 8, targetMonthExpectedDrawCount: 13,
    });
    const trace: string[] = [];
    const baseline = runGenerator({ num: 1500 });
    const boosted = runGenerator({ num: 1500, monthlyTransition, trace: (line) => trace.push(line) });
    const count = (result: typeof baseline) => result.candidates.filter((c) => [...c.main, ...c.supp].includes(17)).length;
    expect(count(boosted)).toBeGreaterThan(count(baseline) + 30);
    expect(trace.join("\n")).toContain("Monthly Bucket Transition Governor manual strong:");
    expect(trace.join("\n")).toContain("accepted-pool count");
    const filtered = runGenerator({ monthlyTransition, excluded: [17], forced: [2] });
    expect(filtered.candidates).toHaveLength(20);
    expect(filtered.candidates.every((c) => ![...c.main, ...c.supp].includes(17) && [...c.main, ...c.supp].includes(2))).toBe(true);
  });
  it.each([false, true])("honors fractional drought weights with monthly construction=%s", (monthly) => {
    const baseline = runGenerator({ num: 1500, monthly });
    const trace: string[] = [];
    const weighted = runGenerator({ num: 1500, monthly, governor: manualGovernor(), trace: (line) => trace.push(line) });
    const count = (result: typeof weighted) => result.candidates.filter((candidate) => [...candidate.main, ...candidate.supp].includes(21)).length;
    expect(weighted.candidates).toHaveLength(1500);
    expect(count(weighted)).toBeGreaterThan(count(baseline) + 30);
    expect(weighted.candidates.every((candidate) => candidate.main.length === 6 && candidate.supp.length === 2 && new Set([...candidate.main, ...candidate.supp]).size === 8)).toBe(true);
    expect(trace.join("\n")).toContain("Drought Evidence Governor manual");
    expect(trace.join("\n")).toContain(`accepted-pool count ${count(weighted)}`);
    const disabled = runGenerator({ num: 1500, monthly, governor: manualGovernor(false) });
    expect(disabled.candidates.map((candidate) => [...candidate.main, ...candidate.supp])).toEqual(baseline.candidates.map((candidate) => [...candidate.main, ...candidate.supp]));
  });

  it("keeps hard inclusions and exclusions authoritative over Manual drought weights", () => {
    const result = runGenerator({ num: 30, governor: manualGovernor(), excluded: [21], forced: [7] });
    expect(result.candidates).toHaveLength(30);
    expect(result.candidates.every((candidate) => [...candidate.main, ...candidate.supp].includes(7) && ![...candidate.main, ...candidate.supp].includes(21))).toBe(true);
  });
  it("keeps scoring evidence absent when the influence profile is not supplied", () => {
    const result = runGenerator({ num: 6 });

    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.every((candidate) => candidate.scoreEvidence === undefined)).toBe(true);
  });

  it("annotates accepted candidates when scoring diagnostics influence is enabled", () => {
    const result = runGenerator({ num: 6, profile: scoringProfile });

    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.every((candidate) => typeof candidate.scoreEvidence === "number")).toBe(true);
    expect(result.candidates.every((candidate) => candidate.scoreEvidence! >= 0 && candidate.scoreEvidence! <= 1)).toBe(true);
    expect(result.candidates.some((candidate) => candidate.scoreEvidenceTrace?.join(" ").includes("diagnostic evidence"))).toBe(true);
    expect(result.candidates.map((candidate) => candidate.trace?.join(" ") ?? "").join(" ")).not.toMatch(/predict|probability|guarantee/i);
  });

  it("preserves selected odd/even quotas while scoring influence is active", () => {
    const result = runGenerator({
      num: 60,
      selectedRatios: ["4:4", "5:3", "3:5"],
      ratioOptions: [
        { ratio: "4:4", count: 3 },
        { ratio: "5:3", count: 2 },
        { ratio: "3:5", count: 1 },
      ],
      profile: scoringProfile,
    });

    expect(result.candidates).toHaveLength(60);
    expect(result.ratioSummary.acceptedRatios).toEqual({
      "4:4": 30,
      "5:3": 20,
      "3:5": 10,
    });
  });
});
