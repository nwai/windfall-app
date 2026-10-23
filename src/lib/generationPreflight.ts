import { buildOddEvenRatioQuotas, type OddEvenRatioOption } from "./oddEvenRatios";
import { normalizeMainDigitCountRule, type MainDigitConstraintOptions } from "./endingDigitRules";
import { buildTerminalShapeQuotas, compositionFeasibleCount, terminalShapeSelectionError, type TerminalShapeQuotaOptions } from "./terminalShapeQuotas";
import { buildTerminalRunQuotas, selectedMaximalRuns, satisfiesTerminalRunRule, terminalRunAvailabilityError, terminalRunSelectionError, type TerminalRunRuleOptions } from "./terminalDigitRuns";
import { violatesRepeatedTerminalDigitFamilyRule, type NormalizedRepeatedTerminalDigitFamilyRule } from "./repeatedTerminalDigitFamilies";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketSets, type MonthlyFrequencyConstraints } from "./monthlyDrawSummary";
import { buildOgaDecileGate, type OgaForecastBiasOptions } from "./ogaDecileAcceptance";
import { monthlyDigitVectorFeasible } from "./terminalCompositionPlanner";

export type GenerationPreflightTarget = "forcedExcluded" | "ratios" | "terminalShapes" | "terminalRuns" | "endingDigits" | "overlap" | "stageIdm" | "latestNeighbour" | "droughtGovernor" | "ogaForecast";
export interface GenerationPreflightIssue { message: string; target: GenerationPreflightTarget }
export interface GenerationSetRequirement {
  label: string;
  numbers: readonly number[];
  min: number;
  max?: number;
  target: GenerationPreflightTarget;
}
export interface ForcedRemoval { number: number; inclusionSources: string[]; exclusionSources: string[] }
export interface NumberRuleSource { label: string; numbers: readonly number[] }
export interface GenerationPreflightOptions {
  mode: "standard" | "rwr45";
  requested: number;
  forcedNumbers: readonly number[];
  excludedNumbers: readonly number[];
  excludeUnselected?: boolean;
  userSelectedNumbers?: readonly number[];
  ratios?: string[];
  ratioOptions?: OddEvenRatioOption[];
  shapes?: TerminalShapeQuotaOptions;
  runs?: TerminalRunRuleOptions;
  endingDigits?: MainDigitConstraintOptions[];
  repeatedFamilies?: NormalizedRepeatedTerminalDigitFamilyRule | null;
  requirements?: GenerationSetRequirement[];
  monthly?: { counts: MonthlyFrequencyConstraints; buckets: MonthlyBucketSets | null } | null;
  bypassedRules?: string[];
  ogaForecast?: OgaForecastBiasOptions;
}
export interface GenerationPreflight {
  mode: GenerationPreflightOptions["mode"];
  blockers: GenerationPreflightIssue[];
  notices: string[];
  eligibleCount: number;
  forcedNumbers: number[];
}

const validNumbers = (values: readonly number[] = []): number[] => [...new Set(values.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))];

export function removedForcedInclusions(inclusions: readonly NumberRuleSource[], exclusions: readonly NumberRuleSource[]): ForcedRemoval[] {
  const numbers = validNumbers(inclusions.flatMap((source) => [...source.numbers]));
  return numbers.map((number) => ({
    number,
    inclusionSources: inclusions.filter((source) => source.numbers.includes(number)).map((source) => source.label),
    exclusionSources: exclusions.filter((source) => source.numbers.includes(number)).map((source) => source.label),
  })).filter((row) => row.exclusionSources.length > 0).sort((a, b) => a.number - b.number);
}

export function analyzeGenerationPreflight(options: GenerationPreflightOptions): GenerationPreflight {
  const blockers: GenerationPreflightIssue[] = [], notices: string[] = [];
  const add = (target: GenerationPreflightTarget, message: string) => blockers.push({ target, message });
  const excluded = new Set(validNumbers(options.excludedNumbers));
  const available = Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !excluded.has(n));
  const forced = validNumbers(options.forcedNumbers), blockedForced = forced.filter((n) => excluded.has(n));
  if (blockedForced.length) add("forcedExcluded", `Forced inclusions also excluded: ${blockedForced.join(", ")}. Resolve the competing rules.`);
  if (forced.length > 8) add("forcedExcluded", `${forced.length} forced inclusions cannot fit in an 8-number candidate.`);
  if (available.length < 8) add("forcedExcluded", `Only ${available.length} eligible numbers remain; each candidate needs 8 unique numbers.`);
  if (options.excludeUnselected && validNumbers(options.userSelectedNumbers).filter((n) => !excluded.has(n)).length < 8) {
    add("forcedExcluded", "Exclude unselected leaves fewer than 8 eligible selected numbers.");
  }
  const cleanForced = forced.filter((n) => !excluded.has(n)), remainingSlots = Math.max(0, 8 - cleanForced.length);
  const checkedRequirements: GenerationSetRequirement[] = [];
  const checkSet = ({ label, numbers, min, max = 8, target }: GenerationSetRequirement) => {
    checkedRequirements.push({ label, numbers, min, max, target });
    const set = new Set(validNumbers(numbers).filter((n) => !excluded.has(n)));
    const forcedHits = cleanForced.filter((n) => set.has(n)).length;
    const possible = Math.min(set.size, forcedHits + remainingSlots);
    if (min > max) add(target, `${label}: minimum ${min} exceeds maximum ${max}.`);
    else if (forcedHits > max) add(target, `${label}: ${forcedHits} forced numbers already exceed maximum ${max}.`);
    else if (min > possible) add(target, `${label}: needs at least ${min}; at most ${possible} can fit after exclusions and forced inclusions.`);
  };
  if (options.monthly) {
    const { counts, buckets } = options.monthly;
    const total = MONTHLY_BUCKET_KEYS.reduce((sum, key) => sum + Math.max(0, counts[key]), 0);
    if (total > 8) add("stageIdm", `Monthly bucket minimums total ${total}; only 8 candidate slots exist.`);
    if (!buckets && total > 0) notices.push("Monthly bucket state is unavailable; those count requirements cannot be checked yet.");
    if (buckets) {
      let neededSlots = 0;
      MONTHLY_BUCKET_KEYS.forEach((key, index) => {
        const min = Math.max(0, counts[key]);
        if (!min) return;
        checkSet({ label: `${index === 8 ? "8x+" : `${index}x`} monthly bucket`, numbers: [...buckets[key]], min, target: "stageIdm" });
        neededSlots += Math.max(0, min - cleanForced.filter((n) => buckets[key].has(n)).length);
      });
      if (total <= 8 && neededSlots > remainingSlots) add("stageIdm", `Monthly minimums need ${neededSlots} additional numbers but forced inclusions leave only ${remainingSlots} slots.`);
    }
  }
  if (options.mode === "rwr45") {
    notices.push("RwR45 uses random coverage, hard inclusions/exclusions and enabled constructive Acceptance Needs. Standard composition quotas and evidence weights are not applied.");
    if (options.bypassedRules?.length) notices.push(`Configured but bypassed: ${options.bypassedRules.join("; ")}.`);
    return { mode: options.mode, blockers, notices, eligibleCount: available.length, forcedNumbers: forced };
  }
  const ogaError = buildOgaDecileGate(options.ogaForecast).error;
  if (options.ogaForecast?.enabled && ogaError) add("ogaForecast", ogaError);
  options.requirements?.forEach(checkSet);
  for (let i = 0; i < checkedRequirements.length; i++) {
    for (let j = i + 1; j < checkedRequirements.length; j++) {
      const a = checkedRequirements[i], b = checkedRequirements[j];
      const aSet = new Set(a.numbers), bSet = new Set(b.numbers);
      const aNeed = Math.max(0, a.min - cleanForced.filter((n) => aSet.has(n)).length);
      const bNeed = Math.max(0, b.min - cleanForced.filter((n) => bSet.has(n)).length);
      const overlap = available.filter((n) => aSet.has(n) && bSet.has(n) && !cleanForced.includes(n)).length;
      if (aNeed + bNeed - overlap > remainingSlots) add(a.target, `${a.label} and ${b.label} need more distinct numbers than the ${remainingSlots} remaining slots allow.`);
    }
  }
  const digitBounds = Array.from({ length: 10 }, (_, digit) => {
    const rule = normalizeMainDigitCountRule(options.endingDigits?.[digit]);
    const min = rule && rule.mode !== "atMost" ? rule.count : 0;
    const max = rule && rule.mode !== "atLeast" ? rule.count : 8;
    if (rule) checkSet({ label: `${digit}-ending rule`, numbers: available.filter((n) => n % 10 === digit), min, max, target: "endingDigits" });
    return { min, max };
  });
  const shapes = options.shapes?.enabled ? options.shapes : undefined;
  const runs = options.runs?.enabled ? options.runs : undefined;
  if (shapes) { const error = terminalShapeSelectionError(shapes); if (error) add("terminalShapes", error); }
  if (runs) {
    const error = terminalRunSelectionError(runs) ?? terminalRunAvailabilityError(runs, available, cleanForced);
    if (error) add("terminalRuns", error);
  }
  if (!blockers.length) {
    // Reuse the engine's structural integer-allocation check; no random trial or historical result is invented.
    const requested = Math.max(1, Math.trunc(options.requested));
    const ratios = buildOddEvenRatioQuotas(requested, options.ratios ?? [], options.ratioOptions);
    const shapeQuotas = shapes ? buildTerminalShapeQuotas(requested, shapes) : { "*": requested };
    const repeatedRule = options.repeatedFamilies;
    const repeatedAllowed = repeatedRule?.scope === "mainAndSupp" ? (count: number) => !violatesRepeatedTerminalDigitFamilyRule(count, repeatedRule) : undefined;
    const vectorNumbers = (vector: number[]) => vector.flatMap((count, digit) => count ? [digit || 10] : []);
    const vectorAllowed = (vector: number[]) => (!runs || satisfiesTerminalRunRule(vectorNumbers(vector), runs))
      && monthlyDigitVectorFeasible(vector, available, cleanForced, options.monthly);
    const needsCompositionCheck = !!shapes || !!runs || !!options.ratios?.length || !!repeatedAllowed || digitBounds.some((bound) => bound.min > 0 || bound.max < 8);
    if (needsCompositionCheck && compositionFeasibleCount(requested, ratios, shapeQuotas, available, cleanForced, digitBounds, repeatedAllowed, vectorAllowed) < requested) {
      add(runs ? "terminalRuns" : shapes ? "terminalShapes" : options.ratios?.length ? "ratios" : "endingDigits", "Selected odd/even, terminal composition, monthly bucket minimums and hard number rules cannot jointly fill the requested allocation. Review forced inclusions and selected counts/shapes/runs.");
    } else if (runs?.mode === "allocation") {
      const targets = buildTerminalRunQuotas(requested, runs);
      const feasible = compositionFeasibleCount(requested, ratios, targets, available, cleanForced, digitBounds, repeatedAllowed,
        (vector) => (!shapes || !!shapeQuotas[vector.filter(Boolean).sort((a, b) => b - a).join("+")])
          && monthlyDigitVectorFeasible(vector, available, cleanForced, options.monthly),
        (vector) => selectedMaximalRuns(vectorNumbers(vector), runs));
      if (feasible < requested) add("terminalRuns", "Exact terminal run allocations conflict with selected ratios, shapes or hard number rules.");
    }
  }
  return { mode: options.mode, blockers, notices, eligibleCount: available.length, forcedNumbers: forced };
}

export const generationPreflightTrace = (result: GenerationPreflight): string[] => [
  `[TRACE] Pre-generation conflict summary: ${result.mode}; eligible ${result.eligibleCount}/45; forced [${result.forcedNumbers.join(", ") || "none"}]; ${result.blockers.length ? `BLOCKED: ${result.blockers.map((row) => row.message).join(" | ")}` : "no known conflict detected (not a complete feasibility proof)"}.`,
  ...result.notices.map((notice) => `[TRACE] Pre-generation notice: ${notice}`),
];
