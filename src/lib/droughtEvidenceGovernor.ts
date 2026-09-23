import type { MonthlyBucketKey, MonthlyBucketSets } from "./monthlyDrawSummary";
import type {
  EmpiricalDroughtQuotaAdvice,
  EmpiricalDroughtQuotaShortlist,
  StrictDroughtQuotaAdvice,
  StrictDroughtQuotaShortlist,
} from "./strictDroughtQuotaAdvice";

export type DroughtEvidenceGovernorMode = "off" | "auto" | "manual";
export type DroughtEvidenceGovernorFamily = "strict" | "empirical";

export interface DroughtEvidenceGovernorSettings {
  strictBuckets: MonthlyBucketKey[];
  empiricalBuckets: MonthlyBucketKey[];
  carryOverEnabled: boolean;
  strictMultiplier: number;
  empiricalMultiplier: number;
  numberOverrides: Record<number, number>;
}

export interface DroughtEvidenceGovernorFamilySummary {
  family: DroughtEvidenceGovernorFamily;
  active: boolean;
  confidence: "low" | "moderate" | "strong";
  sourceLabel: string;
  trials: number;
  oneToThreeLift: number;
  averageHitLift: number;
  eligibleNumbers: number[];
  boostedNumbers: number[];
  bucketCounts: Record<string, number>;
  carryOverNumbers: number[];
  reason: string;
  gatePassed: boolean;
  allowedNumbers: number[];
  oneToThreeHitRate: number;
  expectedRandomOneToThreeHitRate: number;
  averageHits: number;
  expectedRandomAverageHits: number;
}

export interface DroughtEvidenceGovernorNumberDetail {
  number: number;
  multiplier: number;
  bucketLabel: string;
  carriedOver: boolean;
  families: DroughtEvidenceGovernorFamily[];
  strictRank: number | null;
  strictDrought: number | null;
  empiricalRank: number | null;
  empiricalDrought: number | null;
  empiricalRate: number | null;
  empiricalTrials: number | null;
  allowed: boolean;
  weightSource: "auto" | "manual family" | "manual number" | "neutral";
}

export interface DroughtEvidenceGovernorProfile {
  userEnabled: boolean;
  active: boolean;
  mode: DroughtEvidenceGovernorMode;
  numberMultipliers: Record<number, number>;
  boostedNumbers: number[];
  numberDetails: DroughtEvidenceGovernorNumberDetail[];
  activeFamilies: DroughtEvidenceGovernorFamily[];
  summaryLabel: string;
  traceLabel: string;
  familySummaries: DroughtEvidenceGovernorFamilySummary[];
  settings: DroughtEvidenceGovernorSettings;
  contextLabel: string;
  carryOverNumbers: number[];
}

export interface BuildDroughtEvidenceGovernorOptions {
  mode: DroughtEvidenceGovernorMode;
  strictAdvice: StrictDroughtQuotaAdvice;
  strictShortlist: StrictDroughtQuotaShortlist;
  strictEligibleNumbers: number[];
  empiricalAdvice: EmpiricalDroughtQuotaAdvice;
  empiricalShortlist: EmpiricalDroughtQuotaShortlist;
  empiricalEligibleNumbers: number[];
  monthlyBuckets?: MonthlyBucketSets | null;
  carryOverNumbers?: number[];
  targetMonthLabel?: string;
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
  settings?: Partial<DroughtEvidenceGovernorSettings>;
}

const MAX_NUMBER = 45;
const MIN_ONE_TO_THREE_LIFT = 0.02;
const MIN_AVERAGE_HIT_LIFT = 0.1;
export const DROUGHT_GOVERNOR_MAX_MULTIPLIER = 1.45;

export const DROUGHT_GOVERNOR_BUCKET_LABELS: Record<MonthlyBucketKey, string> = {
  undrawn: "0x",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};
const BUCKET_LABELS = DROUGHT_GOVERNOR_BUCKET_LABELS;
const BUCKET_KEYS = Object.keys(BUCKET_LABELS) as MonthlyBucketKey[];

export function normalizeDroughtEvidenceGovernorMode(value: unknown): DroughtEvidenceGovernorMode {
  return value === "auto" || value === "manual" ? value : "off";
}

export function normalizeDroughtEvidenceGovernorSettings(value?: unknown): DroughtEvidenceGovernorSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalizeBuckets = (buckets: unknown): MonthlyBucketKey[] => Array.isArray(buckets)
    ? BUCKET_KEYS.filter((key) => buckets.includes(key))
    : [...BUCKET_KEYS];
  const normalizeWeight = (weight: unknown): number => typeof weight === "number" && Number.isFinite(weight)
    ? Math.round(Math.max(1, Math.min(DROUGHT_GOVERNOR_MAX_MULTIPLIER, weight)) * 100) / 100
    : 1;
  const numberOverrides: Record<number, number> = {};
  if (input.numberOverrides && typeof input.numberOverrides === "object") {
    for (const [key, weight] of Object.entries(input.numberOverrides)) {
      const number = Number(key);
      if (Number.isInteger(number) && number >= 1 && number <= 45 && typeof weight === "number" && Number.isFinite(weight)) {
        numberOverrides[number] = normalizeWeight(weight);
      }
    }
  }
  return {
    strictBuckets: normalizeBuckets(input.strictBuckets),
    empiricalBuckets: normalizeBuckets(input.empiricalBuckets),
    carryOverEnabled: typeof input.carryOverEnabled === "boolean" ? input.carryOverEnabled : true,
    strictMultiplier: normalizeWeight(input.strictMultiplier),
    empiricalMultiplier: normalizeWeight(input.empiricalMultiplier),
    numberOverrides,
  };
}

const emptyMultipliers = (): Record<number, number> => {
  const out: Record<number, number> = {};
  for (let number = 1; number <= MAX_NUMBER; number += 1) out[number] = 1;
  return out;
};

const cleanNumbers = (numbers: readonly number[] | undefined): number[] => (
  Array.from(new Set((numbers ?? []).filter((number) => Number.isInteger(number) && number >= 1 && number <= MAX_NUMBER)))
);

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

const round2 = (value: number): number => Number(value.toFixed(2));

const formatPp = (value: number): string => `${(value * 100).toFixed(1)}pp`;

const bucketLabelForNumber = (number: number, buckets?: MonthlyBucketSets | null): string => {
  if (!buckets) return "bucket unavailable";
  for (const key of Object.keys(BUCKET_LABELS) as MonthlyBucketKey[]) {
    if (buckets[key]?.has(number)) return BUCKET_LABELS[key];
  }
  return "bucket unavailable";
};

const bucketCountsForNumbers = (
  numbers: readonly number[],
  buckets?: MonthlyBucketSets | null,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const number of numbers) {
    const label = bucketLabelForNumber(number, buckets);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
};

const formatBucketCounts = (counts: Record<string, number>): string => {
  const order = ["0x", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+", "bucket unavailable"];
  const parts = order
    .filter((label) => (counts[label] ?? 0) > 0)
    .map((label) => `${label}:${counts[label]}`);
  return parts.length ? parts.join(" ") : "none";
};

const baseBonusForEvidence = (
  advice: Pick<StrictDroughtQuotaAdvice, "confidence" | "source" | "oneToThreeLift" | "averageHits" | "expectedRandomAverageHits">,
): number => {
  const confidenceBase = advice.confidence === "strong" ? 0.2 : advice.confidence === "moderate" ? 0.14 : 0.08;
  const sourceFactor = advice.source === "exact-stage" ? 1 : advice.source === "draw-ordinal" ? 0.82 : advice.source === "all-baseline" ? 0.64 : 0;
  const averageHitLift = advice.averageHits - advice.expectedRandomAverageHits;
  const liftBonus = clamp(Math.max(advice.oneToThreeLift * 0.9, averageHitLift * 0.08), 0, 0.08);
  return clamp((confidenceBase + liftBonus) * sourceFactor, 0, 0.28);
};

const empiricalBaseBonusForEvidence = (
  advice: Pick<EmpiricalDroughtQuotaAdvice, "confidence" | "source" | "oneToThreeLift" | "averageHits" | "expectedRandomAverageHits">,
): number => {
  const confidenceBase = advice.confidence === "strong" ? 0.16 : advice.confidence === "moderate" ? 0.11 : 0.06;
  const sourceFactor = advice.source === "all-baseline" ? 0.68 : 0;
  const averageHitLift = advice.averageHits - advice.expectedRandomAverageHits;
  const liftBonus = clamp(Math.max(advice.oneToThreeLift * 0.75, averageHitLift * 0.06), 0, 0.06);
  return clamp((confidenceBase + liftBonus) * sourceFactor, 0, 0.2);
};

const shouldActivate = (
  advice: Pick<StrictDroughtQuotaAdvice, "shouldApplyQuota" | "oneToThreeLift" | "averageHits" | "expectedRandomAverageHits" | "trials">,
): boolean => {
  const averageHitLift = advice.averageHits - advice.expectedRandomAverageHits;
  return advice.shouldApplyQuota
    && advice.trials > 0
    && (advice.oneToThreeLift >= MIN_ONE_TO_THREE_LIFT || averageHitLift >= MIN_AVERAGE_HIT_LIFT);
};

const summarizeFamily = (
  family: DroughtEvidenceGovernorFamily,
  active: boolean,
  advice: StrictDroughtQuotaAdvice | EmpiricalDroughtQuotaAdvice,
  eligibleNumbers: number[],
  boostedNumbers: number[],
  monthlyBuckets: MonthlyBucketSets | null | undefined,
  carryOverSet: ReadonlySet<number>,
): DroughtEvidenceGovernorFamilySummary => ({
  family,
  active,
  confidence: advice.confidence,
  sourceLabel: advice.sourceLabel,
  trials: advice.trials,
  oneToThreeLift: advice.oneToThreeLift,
  averageHitLift: advice.averageHits - advice.expectedRandomAverageHits,
  eligibleNumbers,
  boostedNumbers,
  bucketCounts: bucketCountsForNumbers(eligibleNumbers, monthlyBuckets),
  carryOverNumbers: eligibleNumbers.filter((number) => carryOverSet.has(number)),
  reason: advice.reason,
  gatePassed: shouldActivate(advice),
  allowedNumbers: [],
  oneToThreeHitRate: advice.oneToThreeHitRate,
  expectedRandomOneToThreeHitRate: advice.expectedRandomOneToThreeHitRate,
  averageHits: advice.averageHits,
  expectedRandomAverageHits: advice.expectedRandomAverageHits,
});

const applyFamilyBoosts = (
  multipliers: Record<number, number>,
  numbers: readonly number[],
  rankMultipliers: Record<number, number>,
  baseBonus: number,
): number[] => {
  const boosted: number[] = [];
  if (baseBonus <= 0) return boosted;

  for (const number of numbers) {
    const rawRankMultiplier = Number(rankMultipliers[number] ?? 1);
    const rankStrength = clamp(Number.isFinite(rawRankMultiplier) ? rawRankMultiplier - 1 : 0, 0, 1);
    const multiplier = round2(1 + baseBonus * Math.max(0.35, rankStrength));
    if (multiplier <= 1) continue;
    multipliers[number] = Math.min(DROUGHT_GOVERNOR_MAX_MULTIPLIER, round2((multipliers[number] ?? 1) * multiplier));
    boosted.push(number);
  }

  return boosted;
};

const listRank = (numbers: readonly number[], number: number): number | null => {
  const index = numbers.indexOf(number);
  return index >= 0 ? index + 1 : null;
};

const buildNumberDetails = (
  boostedNumbers: readonly number[],
  strictBoostedNumbers: readonly number[],
  empiricalBoostedNumbers: readonly number[],
  multipliers: Record<number, number>,
  options: BuildDroughtEvidenceGovernorOptions,
  carryOverSet: ReadonlySet<number>,
): DroughtEvidenceGovernorNumberDetail[] => {
  const strictRowsByNumber = new Map(options.strictShortlist.rows.map((row) => [row.number, row]));
  const empiricalRowsByNumber = new Map(options.empiricalShortlist.rows.map((row) => [row.number, row]));
  const strictNumberSet = new Set(cleanNumbers(strictBoostedNumbers));
  const empiricalNumberSet = new Set(cleanNumbers(empiricalBoostedNumbers));

  return boostedNumbers.map((number) => {
    const strictRow = strictRowsByNumber.get(number);
    const empiricalRow = empiricalRowsByNumber.get(number);
    const families: DroughtEvidenceGovernorFamily[] = [];
    if (strictNumberSet.has(number)) families.push("strict");
    if (empiricalNumberSet.has(number)) families.push("empirical");

    return {
      number,
      multiplier: multipliers[number] ?? 1,
      bucketLabel: bucketLabelForNumber(number, options.monthlyBuckets),
      carriedOver: carryOverSet.has(number),
      families,
      strictRank: strictNumberSet.has(number) ? strictRow?.strictRank ?? listRank(options.strictShortlist.numbers, number) : null,
      strictDrought: strictNumberSet.has(number) ? strictRow?.currentDrought ?? null : null,
      empiricalRank: empiricalNumberSet.has(number) ? listRank(options.empiricalShortlist.numbers, number) : null,
      empiricalDrought: empiricalNumberSet.has(number) ? empiricalRow?.k ?? null : null,
      empiricalRate: empiricalNumberSet.has(number) ? empiricalRow?.p ?? null : null,
      empiricalTrials: empiricalNumberSet.has(number) ? empiricalRow?.trials ?? null : null,
      allowed: false,
      weightSource: "neutral",
    };
  });
};

export function buildDroughtEvidenceGovernorProfile(
  options: BuildDroughtEvidenceGovernorOptions,
): DroughtEvidenceGovernorProfile {
  const mode = normalizeDroughtEvidenceGovernorMode(options.mode);
  const userEnabled = mode !== "off";
  const settings = normalizeDroughtEvidenceGovernorSettings(options.settings);
  const multipliers = emptyMultipliers();
  const strictEligibleNumbers = cleanNumbers(options.strictEligibleNumbers)
    .filter((number) => options.strictShortlist.numbers.includes(number));
  const empiricalEligibleNumbers = cleanNumbers(options.empiricalEligibleNumbers)
    .filter((number) => options.empiricalShortlist.numbers.includes(number));
  const carryOverSet = new Set(cleanNumbers(options.carryOverNumbers));
  const allNumbers = cleanNumbers([...strictEligibleNumbers, ...empiricalEligibleNumbers]);
  const carryOverNumbers = allNumbers.filter((number) => carryOverSet.has(number)).sort((a, b) => a - b);
  const allowed = (numbers: number[], buckets: MonthlyBucketKey[]) => numbers.filter((number) =>
    (settings.carryOverEnabled || !carryOverSet.has(number))
    && buckets.some((key) => options.monthlyBuckets?.[key]?.has(number)),
  );
  const strictAllowed = allowed(strictEligibleNumbers, settings.strictBuckets);
  const empiricalAllowed = allowed(empiricalEligibleNumbers, settings.empiricalBuckets);
  const strictGate = shouldActivate(options.strictAdvice);
  const empiricalGate = shouldActivate(options.empiricalAdvice);
  const strictActive = userEnabled && (mode === "manual" || strictGate);
  const empiricalActive = userEnabled && (mode === "manual" || empiricalGate);

  if (mode === "auto") {
    if (strictActive) applyFamilyBoosts(multipliers, strictAllowed, options.strictShortlist.rankMultipliers, baseBonusForEvidence(options.strictAdvice));
    if (empiricalActive) applyFamilyBoosts(multipliers, empiricalAllowed, options.empiricalShortlist.rankMultipliers, empiricalBaseBonusForEvidence(options.empiricalAdvice));
  } else if (mode === "manual") {
    // A per-number override replaces the combined family weights, avoiding double application.
    for (const number of cleanNumbers([...strictAllowed, ...empiricalAllowed])) {
      const strictWeight = strictAllowed.includes(number) ? settings.strictMultiplier : 1;
      const empiricalWeight = empiricalAllowed.includes(number) ? settings.empiricalMultiplier : 1;
      multipliers[number] = settings.numberOverrides[number]
        ?? Math.min(DROUGHT_GOVERNOR_MAX_MULTIPLIER, round2(strictWeight * empiricalWeight));
    }
  }

  const boostedNumbers = allNumbers.filter((number) => multipliers[number] > 1)
    .sort((a, b) => multipliers[b] - multipliers[a] || a - b);
  const strictBoosted = strictActive ? strictAllowed.filter((number) => multipliers[number] > 1) : [];
  const empiricalBoosted = empiricalActive ? empiricalAllowed.filter((number) => multipliers[number] > 1) : [];
  const familySummaries = [
    summarizeFamily("strict", strictBoosted.length > 0, options.strictAdvice, strictEligibleNumbers, strictBoosted, options.monthlyBuckets, carryOverSet),
    summarizeFamily("empirical", empiricalBoosted.length > 0, options.empiricalAdvice, empiricalEligibleNumbers, empiricalBoosted, options.monthlyBuckets, carryOverSet),
  ];
  familySummaries[0].allowedNumbers = strictAllowed;
  familySummaries[1].allowedNumbers = empiricalAllowed;
  const numberDetails = buildNumberDetails(
    allNumbers.sort((a, b) => multipliers[b] - multipliers[a] || a - b),
    strictEligibleNumbers,
    empiricalEligibleNumbers,
    multipliers,
    options,
    carryOverSet,
  ).map((detail): DroughtEvidenceGovernorNumberDetail => ({
    ...detail,
    allowed: strictAllowed.includes(detail.number) || empiricalAllowed.includes(detail.number),
    weightSource: !userEnabled || !(strictAllowed.includes(detail.number) || empiricalAllowed.includes(detail.number))
      ? "neutral"
      : mode === "manual"
        ? settings.numberOverrides[detail.number] !== undefined ? "manual number" : "manual family"
        : detail.multiplier > 1 ? "auto" : "neutral",
  }));
  const activeFamilies = familySummaries.filter((family) => family.active).map((family) => family.family);
  const contextLabel = [
    options.targetMonthLabel,
    options.targetMonthExpectedDrawCount ? `${options.targetMonthExpectedDrawCount}D` : null,
    options.targetDrawOrdinal ? `D${options.targetDrawOrdinal}` : null,
  ].filter(Boolean).join(" ") || "unavailable";
  const active = boostedNumbers.length > 0;
  const modeLabel = mode === "manual" ? "Manual" : "Auto";
  const summaryLabel = !userEnabled ? "Off" : active
    ? `${modeLabel} · ${activeFamilies.join("+")} · ${boostedNumbers.length} boosted`
    : `${modeLabel} · no boost applied`;
  const formatSelection = (buckets: MonthlyBucketKey[]) => buckets.map((key) => BUCKET_LABELS[key]).join(", ") || "none";
  const gates = familySummaries.map((family) =>
    `${family.family} gate ${family.gatePassed ? "passed" : "not passed"} [${family.sourceLabel}; ${family.trials} trials; 1-3 hits ${(family.oneToThreeHitRate * 100).toFixed(1)}% vs ${(family.expectedRandomOneToThreeHitRate * 100).toFixed(1)}% random; lift ${formatPp(family.oneToThreeLift)}; average ${family.averageHits.toFixed(2)} vs ${family.expectedRandomAverageHits.toFixed(2)}; ${family.boostedNumbers.length}/${family.eligibleNumbers.length} weighted]`,
  ).join("; ");
  const weights = numberDetails.map((detail) =>
    `${detail.number}x${detail.multiplier.toFixed(2)}(${detail.bucketLabel}, ${detail.weightSource})`,
  ).join(", ") || "none";
  const overrides = Object.entries(settings.numberOverrides).map(([number, weight]) => `${number}x${weight.toFixed(2)}`).join(", ") || "none";
  const traceLabel = `Drought Evidence Governor ${mode}: ${!userEnabled ? "off" : active ? `${activeFamilies.join("+")} active` : "no boost applied"}; context ${contextLabel}; strict buckets ${formatBucketCounts(familySummaries[0].bucketCounts)}; empirical buckets ${formatBucketCounts(familySummaries[1].bucketCounts)}; allowed strict buckets ${formatSelection(settings.strictBuckets)}; allowed empirical buckets ${formatSelection(settings.empiricalBuckets)}; weight carry-over numbers ${settings.carryOverEnabled ? "ON" : "OFF"}; carry-over overlap numbers: ${carryOverNumbers.join(", ") || "none"} (count ${carryOverNumbers.length}); ${gates}; manual family weights strict x${settings.strictMultiplier.toFixed(2)}, empirical x${settings.empiricalMultiplier.toFixed(2)}; saved number overrides ${overrides}${mode !== "manual" ? " (inactive outside Manual)" : ""}; soft weights ${weights}. ${mode === "manual" ? "Manual experiment: Auto gate is bypassed; bucket masks and exclusions still apply." : "Gate uses original shortlist replay; user-filtered subsets and individual multipliers have not been separately validated."}`;

  return {
    userEnabled,
    active,
    mode,
    settings,
    numberMultipliers: multipliers,
    boostedNumbers,
    numberDetails,
    activeFamilies,
    summaryLabel,
    traceLabel,
    familySummaries,
    contextLabel,
    carryOverNumbers,
  };
}

export function droughtEvidenceGovernorMultiplier(
  number: number,
  profile?: DroughtEvidenceGovernorProfile,
): number {
  if (!profile?.active) return 1;
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return 1;
  const multiplier = profile.numberMultipliers[number];
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}
