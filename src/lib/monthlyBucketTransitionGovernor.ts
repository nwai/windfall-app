import type { Draw } from "../types";
import {
  buildMonthlyBucketTransitionMonths,
  MONTHLY_TRANSITION_BUCKET_LABELS,
  type MonthlyBucketTransitionMonth,
  type MonthlyTransitionBucketIndex,
} from "./monthlyBucketTransitions";
import { filterRowsForHistoryBaselines } from "./monthlyAverageScope";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketKey, type MonthlyBucketSets } from "./monthlyDrawSummary";
import { auditHistorySchedule } from "./historyScheduleAudit";

export type MonthlyBucketTransitionGovernorMode = "off" | "auto" | "light" | "normal" | "strong";
export type MonthlyBucketTransitionGovernorRule = "two-to-three" | "three-to-four";
export type MonthlyBucketTransitionGovernorStrength = "off" | "light" | "normal" | "strong";

// User-selected experimental weights, not estimated draw probabilities.
export const MONTHLY_TRANSITION_MANUAL_WEIGHTS = { light: 1.10, normal: 1.25, strong: 1.40 } as const;
export const normalizeMonthlyBucketTransitionGovernorMode = (value: unknown): MonthlyBucketTransitionGovernorMode => (
  value === "auto" || value === "light" || value === "normal" || value === "strong" ? value : "off"
);
export const monthlyBucketTransitionGovernorModeLabel = (value: unknown): string => {
  const mode = normalizeMonthlyBucketTransitionGovernorMode(value);
  return mode === "off" ? "Off" : mode === "auto" ? "Auto" : `Manual ${mode}`;
};

export interface MonthlyBucketTransitionGovernorEvidence {
  trials: number;
  sourceExposure: number;
  hits: number;
  atLeastOneHits: number;
  atLeastOneRate: number | null;
  expectedRandomAtLeastOneRate: number | null;
  atLeastOneLift: number | null;
  perNumberRate: number | null;
  expectedRandomPerNumberRate: number;
  perNumberLift: number | null;
}

export interface MonthlyBucketTransitionGovernorFirstReach {
  targetBucket: MonthlyTransitionBucketIndex;
  targetLabel: string;
  monthsEligible: number;
  monthsReached: number;
  reachedByDraw: number;
  reachedByDrawRate: number | null;
}

export interface MonthlyBucketTransitionGovernorRuleSummary {
  rule: MonthlyBucketTransitionGovernorRule;
  active: boolean;
  label: string;
  sourceBucket: MonthlyTransitionBucketIndex;
  sourceKey: MonthlyBucketKey;
  sourceLabel: string;
  targetBucket: MonthlyTransitionBucketIndex;
  targetLabel: string;
  currentNumbers: number[];
  multiplier: number;
  strength: MonthlyBucketTransitionGovernorStrength;
  evidenceGatePassed: boolean;
  evidence: MonthlyBucketTransitionGovernorEvidence;
  firstReach: MonthlyBucketTransitionGovernorFirstReach | null;
  reason: string;
}

export interface MonthlyBucketTransitionGovernorNumberDetail {
  number: number;
  multiplier: number;
  bucketKey: MonthlyBucketKey;
  bucketLabel: string;
  ruleLabels: string[];
  reason: string;
}

export interface MonthlyBucketTransitionGovernorProfile {
  userEnabled: boolean;
  active: boolean;
  mode: MonthlyBucketTransitionGovernorMode;
  internalStrength: MonthlyBucketTransitionGovernorStrength;
  numberMultipliers: Record<number, number>;
  boostedNumbers: number[];
  numberDetails: MonthlyBucketTransitionGovernorNumberDetail[];
  activeRules: MonthlyBucketTransitionGovernorRuleSummary[];
  checkedRules: MonthlyBucketTransitionGovernorRuleSummary[];
  summaryLabel: string;
  traceLabel: string;
  scopeLabel: string;
  contextLabel: string;
}

export interface BuildMonthlyBucketTransitionGovernorOptions {
  mode: MonthlyBucketTransitionGovernorMode;
  history: readonly Draw[];
  monthlyBuckets?: MonthlyBucketSets | null;
  targetMonthLabel?: string;
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
  includeSupp?: boolean;
  maxNumber?: number;
}

const DEFAULT_MAX_NUMBER = 45;
const MIN_SAME_LENGTH_MONTHS = 3;
const MIN_RULE_TRIALS = 3;
const MAX_COMBINED_MULTIPLIER = 1.6;

const BUCKET_KEY_BY_INDEX: Record<MonthlyTransitionBucketIndex, MonthlyBucketKey> = {
  0: "undrawn",
  1: "times1",
  2: "times2",
  3: "times3",
  4: "times4",
  5: "times5",
  6: "times6",
  7: "times7",
  8: "times8",
};

const emptyMultipliers = (maxNumber: number): Record<number, number> => {
  const out: Record<number, number> = {};
  for (let number = 1; number <= maxNumber; number += 1) out[number] = 1;
  return out;
};

const cleanNumbers = (numbers: Iterable<number> | undefined, maxNumber: number): number[] => (
  Array.from(new Set(Array.from(numbers ?? []).filter((number) => (
    Number.isInteger(number) && number >= 1 && number <= maxNumber
  )))).sort((left, right) => left - right)
);

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

const round2 = (value: number): number => Number(value.toFixed(2));

const formatPct = (value: number | null | undefined): string => (
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`
);

const formatLift = (value: number | null | undefined): string => (
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value.toFixed(2)}x`
);

const chooseStrength = (multiplier: number): MonthlyBucketTransitionGovernorStrength => {
  if (multiplier <= 1) return "off";
  if (multiplier < 1.18) return "light";
  if (multiplier < 1.36) return "normal";
  return "strong";
};

const maxStrength = (
  strengths: readonly MonthlyBucketTransitionGovernorStrength[],
): MonthlyBucketTransitionGovernorStrength => {
  const rank: Record<MonthlyBucketTransitionGovernorStrength, number> = {
    off: 0,
    light: 1,
    normal: 2,
    strong: 3,
  };
  return strengths.reduce<MonthlyBucketTransitionGovernorStrength>((best, strength) => (
    rank[strength] > rank[best] ? strength : best
  ), "off");
};

const combination = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= effectiveK; i += 1) {
    result = (result * (n - effectiveK + i)) / i;
  }
  return result;
};

const randomAtLeastOne = (riskSize: number, maxNumber: number, drawSize: number): number => {
  if (riskSize <= 0) return 0;
  if (riskSize >= maxNumber) return 1;
  const total = combination(maxNumber, drawSize);
  if (total <= 0) return 0;
  const misses = combination(maxNumber - riskSize, drawSize);
  return clamp(1 - (misses / total), 0, 1);
};

const bucketLabelForKey = (key: MonthlyBucketKey): string => {
  const bucketIndex = MONTHLY_BUCKET_KEYS.indexOf(key);
  return bucketIndex >= 0 ? MONTHLY_TRANSITION_BUCKET_LABELS[bucketIndex] : key;
};

const currentNumbersForBucket = (
  monthlyBuckets: MonthlyBucketSets | null | undefined,
  key: MonthlyBucketKey,
  maxNumber: number,
): number[] => cleanNumbers(monthlyBuckets?.[key], maxNumber);

const hasAnyCurrentBucketAtOrAbove = (
  monthlyBuckets: MonthlyBucketSets | null | undefined,
  bucket: MonthlyTransitionBucketIndex,
): boolean => {
  if (!monthlyBuckets) return false;
  return MONTHLY_BUCKET_KEYS.some((key, index) => index >= bucket && (monthlyBuckets[key]?.size ?? 0) > 0);
};

const selectBaselineMonths = (
  months: readonly MonthlyBucketTransitionMonth[],
  targetMonthLabel: string | undefined,
  targetMonthExpectedDrawCount: number | undefined,
): { months: MonthlyBucketTransitionMonth[]; scopeLabel: string } => {
  const baseline = filterRowsForHistoryBaselines(months, (month) => month.monthLabel, month => month.drawStates[0]?.drawDate)
    .filter((month) => month.isComplete)
    .filter((month) => !targetMonthLabel || month.monthLabel < targetMonthLabel)
    .filter((month) => {
      const dates = month.drawStates.map((state) => ({ date: state.drawDate }));
      const audit = auditHistorySchedule(dates);
      return month.drawCount === month.totalDrawCount
        && new Set(dates.map((row) => row.date)).size === dates.length
        && !audit.invalidDateRows.length && !audit.offScheduleRows.length && !audit.missingDates.length;
    });
  if (!baseline.length) return { months: [], scopeLabel: "no completed baseline months" };

  const sameLength = Number.isInteger(targetMonthExpectedDrawCount)
    ? baseline.filter((month) => month.totalDrawCount === targetMonthExpectedDrawCount)
    : [];
  if (sameLength.length >= MIN_SAME_LENGTH_MONTHS) {
    return {
      months: sameLength,
      scopeLabel: `${sameLength.length} completed ${targetMonthExpectedDrawCount}D baseline months`,
    };
  }

  return {
    months: baseline,
    scopeLabel: `${baseline.length} completed baseline months (same-length fallback)`,
  };
};

const transitionEvidence = (
  months: readonly MonthlyBucketTransitionMonth[],
  drawOrdinal: number,
  sourceBucket: MonthlyTransitionBucketIndex,
  options: {
    maxNumber: number;
    drawSize: number;
    requireNoBucketAtOrAbove?: MonthlyTransitionBucketIndex;
  },
): MonthlyBucketTransitionGovernorEvidence => {
  let trials = 0;
  let sourceExposure = 0;
  let hits = 0;
  let atLeastOneHits = 0;
  let expectedAtLeastOne = 0;

  for (const month of months) {
    const events = month.events.filter((event) => event.drawOrdinal === drawOrdinal);
    if (!events.length) continue;
    if (
      options.requireNoBucketAtOrAbove !== undefined
      && events.some((event) => event.beforeBucket >= options.requireNoBucketAtOrAbove!)
    ) {
      continue;
    }
    const riskEvents = events.filter((event) => event.beforeBucket === sourceBucket);
    const riskSize = riskEvents.length;
    if (riskSize <= 0) continue;
    const monthHits = riskEvents.filter((event) => event.drawn).length;
    trials += 1;
    sourceExposure += riskSize;
    hits += monthHits;
    if (monthHits > 0) atLeastOneHits += 1;
    expectedAtLeastOne += randomAtLeastOne(riskSize, options.maxNumber, options.drawSize);
  }

  const atLeastOneRate = trials > 0 ? atLeastOneHits / trials : null;
  const expectedRandomAtLeastOneRate = trials > 0 ? expectedAtLeastOne / trials : null;
  const perNumberRate = sourceExposure > 0 ? hits / sourceExposure : null;
  const expectedRandomPerNumberRate = options.drawSize / options.maxNumber;

  return {
    trials,
    sourceExposure,
    hits,
    atLeastOneHits,
    atLeastOneRate,
    expectedRandomAtLeastOneRate,
    atLeastOneLift: atLeastOneRate !== null && expectedRandomAtLeastOneRate && expectedRandomAtLeastOneRate > 0
      ? atLeastOneRate / expectedRandomAtLeastOneRate
      : null,
    perNumberRate,
    expectedRandomPerNumberRate,
    perNumberLift: perNumberRate !== null && expectedRandomPerNumberRate > 0
      ? perNumberRate / expectedRandomPerNumberRate
      : null,
  };
};

const firstReachEvidence = (
  months: readonly MonthlyBucketTransitionMonth[],
  drawOrdinal: number,
  targetBucket: MonthlyTransitionBucketIndex,
): MonthlyBucketTransitionGovernorFirstReach => {
  let monthsEligible = 0;
  let monthsReached = 0;
  let reachedByDraw = 0;

  for (const month of months) {
    if (month.drawCount < drawOrdinal) continue;
    monthsEligible += 1;
    const firstReach = month.drawStates.find((state) => (state.distribution[targetBucket] ?? 0) > 0)?.drawOrdinal ?? null;
    if (firstReach !== null) {
      monthsReached += 1;
      if (firstReach <= drawOrdinal) reachedByDraw += 1;
    }
  }

  return {
    targetBucket,
    targetLabel: MONTHLY_TRANSITION_BUCKET_LABELS[targetBucket],
    monthsEligible,
    monthsReached,
    reachedByDraw,
    reachedByDrawRate: monthsEligible > 0 ? reachedByDraw / monthsEligible : null,
  };
};

const computeMultiplier = (
  evidence: MonthlyBucketTransitionGovernorEvidence,
  rule: MonthlyBucketTransitionGovernorRule,
): number => {
  const atLeastDiff = evidence.atLeastOneRate !== null && evidence.expectedRandomAtLeastOneRate !== null
    ? Math.max(0, evidence.atLeastOneRate - evidence.expectedRandomAtLeastOneRate)
    : 0;
  const atLeastLiftBonus = evidence.atLeastOneLift !== null
    ? Math.max(0, evidence.atLeastOneLift - 1)
    : 0;
  const sampleFactor = clamp(evidence.trials / 12, 0.45, 1);
  const rawBonus = (atLeastDiff * 1.25) + (atLeastLiftBonus * 0.22);
  const cap = rule === "three-to-four" ? 1.55 : 1.4;
  return round2(clamp(1 + (rawBonus * sampleFactor), 1.05, cap));
};

export const monthlyTransitionEvidenceQualifies = (
  evidence: MonthlyBucketTransitionGovernorEvidence,
): boolean => {
  if (evidence.trials < MIN_RULE_TRIALS) return false;
  const atLeastDiff = evidence.atLeastOneRate !== null && evidence.expectedRandomAtLeastOneRate !== null
    ? evidence.atLeastOneRate - evidence.expectedRandomAtLeastOneRate
    : 0;
  const atLeastLift = evidence.atLeastOneLift ?? 0;
  // A cumulative first-arrival rate cannot establish next-draw or per-number lift.
  return (evidence.perNumberLift ?? 0) > 1 && (atLeastDiff >= 0.04 || atLeastLift >= 1.12);
};

const ruleReason = (
  active: boolean,
  evidence: MonthlyBucketTransitionGovernorEvidence,
  firstReach: MonthlyBucketTransitionGovernorFirstReach | null,
  currentNumbers: readonly number[],
  activeGateReason: string,
): string => {
  if (!currentNumbers.length) return "No current numbers sit in the source bucket for this transition.";
  if (evidence.trials < MIN_RULE_TRIALS) return `Only ${evidence.trials} eligible historical month${evidence.trials === 1 ? "" : "s"} for this transition; kept observe-only.`;
  if (!active) {
    return `Kept neutral: next-draw at-least-one rate ${formatPct(evidence.atLeastOneRate)} vs random ${formatPct(evidence.expectedRandomAtLeastOneRate)}; per-number rate ${formatPct(evidence.perNumberRate)} vs random ${formatPct(evidence.expectedRandomPerNumberRate)}. Both evidence gates must pass; cumulative first-reach timing cannot activate a boost.`;
  }
  const reach = firstReach
    ? `; ${firstReach.targetLabel} reached by this draw in ${firstReach.reachedByDraw}/${firstReach.monthsEligible} baseline months`
    : "";
  return `${activeGateReason}: observed next-draw at-least-one rate ${formatPct(evidence.atLeastOneRate)} vs random ${formatPct(evidence.expectedRandomAtLeastOneRate)} (${formatLift(evidence.atLeastOneLift)} lift); per-number rate ${formatPct(evidence.perNumberRate)} vs random ${formatPct(evidence.expectedRandomPerNumberRate)}${reach}. Experimental support from ${evidence.trials} months; not a calibrated forecast`;
};

const buildRuleSummary = (
  args: {
    rule: MonthlyBucketTransitionGovernorRule;
    label: string;
    baselineMonths: readonly MonthlyBucketTransitionMonth[];
    targetDrawOrdinal: number;
    sourceBucket: MonthlyTransitionBucketIndex;
    targetBucket: MonthlyTransitionBucketIndex;
    monthlyBuckets: MonthlyBucketSets | null | undefined;
    maxNumber: number;
    drawSize: number;
    requireNoBucketAtOrAbove?: MonthlyTransitionBucketIndex;
    activeGateReason: string;
    mode: MonthlyBucketTransitionGovernorMode;
  },
): MonthlyBucketTransitionGovernorRuleSummary => {
  const sourceKey = BUCKET_KEY_BY_INDEX[args.sourceBucket];
  const currentNumbers = currentNumbersForBucket(args.monthlyBuckets, sourceKey, args.maxNumber);
  const evidence = transitionEvidence(args.baselineMonths, args.targetDrawOrdinal, args.sourceBucket, {
    maxNumber: args.maxNumber,
    drawSize: args.drawSize,
    requireNoBucketAtOrAbove: args.requireNoBucketAtOrAbove,
  });
  const firstReach = firstReachEvidence(args.baselineMonths, args.targetDrawOrdinal, args.targetBucket);
  const evidenceGatePassed = monthlyTransitionEvidenceQualifies(evidence);
  const manualWeight = args.mode === "off" || args.mode === "auto" ? null : MONTHLY_TRANSITION_MANUAL_WEIGHTS[args.mode];
  const active = currentNumbers.length > 0 && (manualWeight !== null || evidenceGatePassed);
  const multiplier = active ? manualWeight ?? computeMultiplier(evidence, args.rule) : 1;
  const reason = active && manualWeight !== null
    ? `User-selected ${args.mode} experiment; Auto evidence gate ${evidenceGatePassed ? "passed" : "not passed"} (bypassed). ${evidence.trials} eligible earlier months; next-draw at-least-one rate ${formatPct(evidence.atLeastOneRate)} vs random ${formatPct(evidence.expectedRandomAtLeastOneRate)}; per-number rate ${formatPct(evidence.perNumberRate)} vs random ${formatPct(evidence.expectedRandomPerNumberRate)}. Not evidence of predictive accuracy.`
    : ruleReason(active, evidence, firstReach, currentNumbers, args.activeGateReason);
  return {
    rule: args.rule,
    active,
    label: args.label,
    sourceBucket: args.sourceBucket,
    sourceKey,
    sourceLabel: MONTHLY_TRANSITION_BUCKET_LABELS[args.sourceBucket],
    targetBucket: args.targetBucket,
    targetLabel: MONTHLY_TRANSITION_BUCKET_LABELS[args.targetBucket],
    currentNumbers,
    multiplier,
    strength: chooseStrength(multiplier),
    evidenceGatePassed,
    evidence,
    firstReach,
    reason,
  };
};

const traceForActiveRule = (rule: MonthlyBucketTransitionGovernorRuleSummary): string => (
  `${rule.label}: ${rule.sourceLabel}->${rule.targetLabel}; current ${rule.sourceLabel} numbers ${rule.currentNumbers.join(", ") || "none"}; `
  + `${rule.reason}; boost x${rule.multiplier.toFixed(2)} (${rule.strength})`
);

const traceForCheckedRule = (rule: MonthlyBucketTransitionGovernorRuleSummary): string => (
  `${rule.label}: ${rule.sourceLabel}->${rule.targetLabel}; ${rule.reason}`
);

export function buildMonthlyBucketTransitionGovernorProfile(
  options: BuildMonthlyBucketTransitionGovernorOptions,
): MonthlyBucketTransitionGovernorProfile {
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const includeSupp = options.includeSupp ?? true;
  const drawSize = includeSupp ? 8 : 6;
  const mode = normalizeMonthlyBucketTransitionGovernorMode(options.mode);
  const modeLabel = monthlyBucketTransitionGovernorModeLabel(mode);
  const userEnabled = mode !== "off";
  const multipliers = emptyMultipliers(maxNumber);
  const context = [
    options.targetMonthLabel,
    options.targetMonthExpectedDrawCount ? `${options.targetMonthExpectedDrawCount}D` : null,
    options.targetDrawOrdinal ? `D${options.targetDrawOrdinal}` : null,
  ].filter(Boolean).join(" ") || "current context unavailable";

  if (!userEnabled) {
    return {
      userEnabled: false,
      active: false,
      mode,
      internalStrength: "off",
      numberMultipliers: multipliers,
      boostedNumbers: [],
      numberDetails: [],
      activeRules: [],
      checkedRules: [],
      summaryLabel: "Off",
      traceLabel: "Monthly Bucket Transition Governor off.",
      scopeLabel: "Off",
      contextLabel: context,
    };
  }

  const targetDrawOrdinal = options.targetDrawOrdinal ?? 0;
  if (!options.monthlyBuckets || !Number.isInteger(targetDrawOrdinal) || targetDrawOrdinal < 1 || targetDrawOrdinal > 31
    || (options.targetMonthExpectedDrawCount !== undefined && targetDrawOrdinal > options.targetMonthExpectedDrawCount)
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.targetMonthLabel ?? "")) {
    return {
      userEnabled: true,
      active: false,
      mode,
      internalStrength: "off",
      numberMultipliers: multipliers,
      boostedNumbers: [],
      numberDetails: [],
      activeRules: [],
      checkedRules: [],
      summaryLabel: `${modeLabel} · unavailable`,
      traceLabel: `Monthly Bucket Transition Governor ${modeLabel.toLowerCase()}: ${context}; monthly bucket state or target draw ordinal is unavailable or invalid, so no boost was applied.`,
      scopeLabel: "Unavailable",
      contextLabel: context,
    };
  }

  const allMonths = buildMonthlyBucketTransitionMonths(options.history, { includeSupp, maxNumber });
  const { months: baselineMonths, scopeLabel } = selectBaselineMonths(
    allMonths,
    options.targetMonthLabel,
    options.targetMonthExpectedDrawCount,
  );
  const checkedRules: MonthlyBucketTransitionGovernorRuleSummary[] = [];

  if (targetDrawOrdinal >= 3 && targetDrawOrdinal <= 5) {
    checkedRules.push(buildRuleSummary({
      rule: "two-to-three",
      label: "Early 2x-to-3x formation",
      baselineMonths,
      targetDrawOrdinal,
      sourceBucket: 2,
      targetBucket: 3,
      monthlyBuckets: options.monthlyBuckets,
      maxNumber,
      drawSize,
      activeGateReason: "Early-month 3x formation pressure",
      mode,
    }));
  }

  const hasFourPlusNow = hasAnyCurrentBucketAtOrAbove(options.monthlyBuckets, 4);
  if (targetDrawOrdinal >= 7 && targetDrawOrdinal <= 9) {
    const delayedRule = buildRuleSummary({
      rule: "three-to-four",
      label: "Delayed first 4x transition",
      baselineMonths,
      targetDrawOrdinal,
      sourceBucket: 3,
      targetBucket: 4,
      monthlyBuckets: options.monthlyBuckets,
      maxNumber,
      drawSize,
      requireNoBucketAtOrAbove: 4,
      activeGateReason: "No 4x bucket has appeared yet",
      mode,
    });
    checkedRules.push(hasFourPlusNow
      ? {
        ...delayedRule,
        active: false,
        multiplier: 1,
        strength: "off",
        reason: "A 4x-or-higher bucket already exists in the current month, so the delayed first-4x pressure rule is not applicable.",
      }
      : delayedRule);
  }

  const activeRules = checkedRules.filter((rule) => rule.active && rule.multiplier > 1);
  activeRules.forEach((rule) => {
    rule.currentNumbers.forEach((number) => {
      multipliers[number] = round2(clamp((multipliers[number] ?? 1) * rule.multiplier, 1, MAX_COMBINED_MULTIPLIER));
    });
  });

  const boostedNumbers = Object.entries(multipliers)
    .filter(([, multiplier]) => multiplier > 1)
    .map(([number]) => Number(number))
    .sort((left, right) => (multipliers[right] ?? 1) - (multipliers[left] ?? 1) || left - right);
  const activeRuleLabelsByNumber = new Map<number, string[]>();
  activeRules.forEach((rule) => {
    rule.currentNumbers.forEach((number) => {
      activeRuleLabelsByNumber.set(number, [...(activeRuleLabelsByNumber.get(number) ?? []), rule.label]);
    });
  });
  const numberDetails = boostedNumbers.map<MonthlyBucketTransitionGovernorNumberDetail>((number) => {
    const bucketKey = MONTHLY_BUCKET_KEYS.find((key) => options.monthlyBuckets?.[key]?.has(number)) ?? "undrawn";
    const ruleLabels = activeRuleLabelsByNumber.get(number) ?? [];
    return {
      number,
      multiplier: multipliers[number] ?? 1,
      bucketKey,
      bucketLabel: bucketLabelForKey(bucketKey),
      ruleLabels,
      reason: ruleLabels.join(" + ") || "No active transition rule.",
    };
  });
  const internalStrength = maxStrength(activeRules.map((rule) => rule.strength));
  const active = boostedNumbers.length > 0;
  const summaryLabel = active
    ? `${modeLabel} · applied ${internalStrength} · ${boostedNumbers.length} boosted`
    : checkedRules.length
      ? `${modeLabel} · observe-only`
      : `${modeLabel} · no stage rule`;
  const traceDetail = active
    ? activeRules.map(traceForActiveRule).join(" | ")
    : checkedRules.length
      ? checkedRules.map(traceForCheckedRule).join(" | ")
      : "No configured transition rule applies to this draw ordinal.";
  const weights = boostedNumbers
    .map((number) => `${number}×${(multipliers[number] ?? 1).toFixed(2)}(${numberDetails.find((detail) => detail.number === number)?.bucketLabel ?? "bucket"})`)
    .join(", ");
  const traceLabel = active
    ? `Monthly Bucket Transition Governor ${modeLabel.toLowerCase()}: ${context}; ${scopeLabel}; ${traceDetail}; soft weights ${weights}.`
    : `Monthly Bucket Transition Governor ${modeLabel.toLowerCase()}: ${context}; ${scopeLabel}; ${traceDetail} No monthly-transition boost was applied.`;

  return {
    userEnabled,
    active,
    mode,
    internalStrength,
    numberMultipliers: multipliers,
    boostedNumbers,
    numberDetails,
    activeRules,
    checkedRules,
    summaryLabel,
    traceLabel,
    scopeLabel,
    contextLabel: context,
  };
}

export function monthlyBucketTransitionGovernorMultiplier(
  number: number,
  profile?: MonthlyBucketTransitionGovernorProfile,
): number {
  if (!profile?.active) return 1;
  if (!Number.isInteger(number) || number < 1) return 1;
  const multiplier = profile.numberMultipliers[number];
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}
