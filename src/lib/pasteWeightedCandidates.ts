import type { CandidateSet } from "../types";
import { candidateShapeProfile } from "./adaptiveCandidateShapes";
import { bucketLabelForTimes, MONTHLY_BUCKET_KEYS, type MonthlyBucketSets } from "./monthlyDrawSummary";
import {
  buildOddEvenRatioQuotas,
  oddEvenRatioForNumbers,
  parseOddEvenRatio,
  summarizeOddEvenRatioNumbers,
  type OddEvenRatioOption,
  type OddEvenRatioSummary,
} from "./oddEvenRatios";
import { weightedSampleWithoutReplacement } from "./weightedSample";

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;
const MAIN_COUNT = 6;
const MIN_GENERATED_CANDIDATES = 4;
const MAX_GENERATED_CANDIDATES = 30;

export const PASTE_ENDING_5_NUMBERS = [5, 15, 25, 35, 45] as const;
export const PASTE_ENDING_0_NUMBERS = [10, 20, 30, 40] as const;

export type PasteWeightedCandidateConstraintMode = "any" | "require" | "exclude";

export interface PasteWeightedCandidateConstraints {
  ending5?: PasteWeightedCandidateConstraintMode;
  ending0?: PasteWeightedCandidateConstraintMode;
  oddEven?: {
    enabled?: boolean;
    selectedRatios?: string[];
    ratioOptions?: OddEvenRatioOption[];
  };
  adaptiveShape?: {
    enabled?: boolean;
    mode?: "observe" | "quota";
    profileOptions?: OddEvenRatioOption[];
  };
  stageIdm?: {
    enabled?: boolean;
    bucketSets?: MonthlyBucketSets | null;
    targetCounts?: readonly number[];
  };
}

export interface PastedCandidateRow {
  lineNumber: number;
  raw: string;
  numbers: number[];
  duplicateNumbers: number[];
  outOfRangeNumbers: number[];
  expectedSixNumbers: boolean;
}

export interface PastedCandidateNumberCount {
  number: number;
  count: number;
  share: number;
}

export interface PastedCandidateParseResult {
  rows: PastedCandidateRow[];
  acceptedRows: number;
  totalRows: number;
  totalCountedNumbers: number;
  uniqueNumbers: number;
  counts: PastedCandidateNumberCount[];
  invalidTokens: string[];
  oddEvenRatios: OddEvenRatioOption[];
}

export interface PasteWeightedGenerationResult extends PastedCandidateParseResult {
  candidates: CandidateSet[];
  warnings: string[];
  oddEvenRatioSummary?: OddEvenRatioSummary;
  adaptiveShapeSummary?: OddEvenRatioSummary;
  stageIdmSummary?: PasteWeightedStageIdmSummary;
}

export interface PasteWeightedStageIdmSummary {
  requested: number;
  totalAccepted: number;
  totalAttempts: number;
  targetCounts: number[];
  acceptedBucketCounts: number[];
}

const clampInteger = (value: number, min: number, max: number): number => {
  const floored = Math.floor(Number.isFinite(value) ? value : min);
  return Math.min(max, Math.max(min, floored));
};

const combinations = (n: number, k: number): number => {
  if (k < 0 || n < k) return 0;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }
  return Math.floor(result);
};

const ending5Set = new Set<number>(PASTE_ENDING_5_NUMBERS);
const ending0Set = new Set<number>(PASTE_ENDING_0_NUMBERS);

const numericTokensForLine = (line: string): string[] => line.match(/\d+/g) ?? [];

const validNumbersInTokens = (tokens: string[]): number[] => tokens
  .map((token) => Number(token))
  .filter((value) => Number.isInteger(value) && value >= MIN_NUMBER && value <= MAX_NUMBER);

const nextNonEmptyLine = (lines: string[], startIndex: number): string | null => {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (raw) return raw;
  }
  return null;
};

const isNumberedListLabel = (raw: string, tokens: string[], nextRaw: string | null): boolean => {
  if (tokens.length !== 1 || !/^\s*\d+\s*[).:-]?\s*$/.test(raw)) return false;
  if (!nextRaw) return false;
  return validNumbersInTokens(numericTokensForLine(nextRaw)).length >= MAIN_COUNT;
};

const hasAnyFromSet = (numbers: number[], target: Set<number>): boolean => (
  numbers.some((number) => target.has(number))
);

const hasNoneFromSet = (numbers: number[], target: Set<number>): boolean => (
  numbers.every((number) => !target.has(number))
);

const isAllowedByExclusions = (
  number: number,
  constraints: PasteWeightedCandidateConstraints,
): boolean => {
  if (constraints.ending5 === "exclude" && ending5Set.has(number)) return false;
  if (constraints.ending0 === "exclude" && ending0Set.has(number)) return false;
  return true;
};

export function candidateSatisfiesPasteConstraints(
  main: number[],
  constraints: PasteWeightedCandidateConstraints = {},
): boolean {
  if (constraints.ending5 === "require" && !hasAnyFromSet(main, ending5Set)) return false;
  if (constraints.ending5 === "exclude" && !hasNoneFromSet(main, ending5Set)) return false;
  if (constraints.ending0 === "require" && !hasAnyFromSet(main, ending0Set)) return false;
  if (constraints.ending0 === "exclude" && !hasNoneFromSet(main, ending0Set)) return false;
  return true;
}

const describeConstraintNumbers = (numbers: readonly number[]): string => numbers.join(", ");

export const reconcileStageIdmTargetCounts = (
  rawCounts: readonly number[] | null | undefined,
  targetTotal = MAIN_COUNT,
): number[] => {
  const normalized = Array.from({ length: MONTHLY_BUCKET_KEYS.length }, (_, index) => {
    const value = Number(rawCounts?.[index] ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const total = normalized.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || targetTotal <= 0) {
    return new Array(MONTHLY_BUCKET_KEYS.length).fill(0);
  }

  const scaled = normalized.map((value) => (value / total) * targetTotal);
  const floors = scaled.map(Math.floor);
  let remainder = targetTotal - floors.reduce((sum, value) => sum + value, 0);
  const rankedRemainders = scaled
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  const reconciled = [...floors];
  for (const { index } of rankedRemainders) {
    if (remainder <= 0) break;
    reconciled[index] += 1;
    remainder -= 1;
  }
  return reconciled;
};

const normalizeStageIdmTargetCounts = (targetCounts: readonly number[] | undefined): number[] => (
  Array.from({ length: MONTHLY_BUCKET_KEYS.length }, (_, index) => {
    const value = Number(targetCounts?.[index] ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  })
);

const bucketIndexForNumber = (
  bucketSets: MonthlyBucketSets,
  number: number,
): number | null => {
  for (let index = 0; index < MONTHLY_BUCKET_KEYS.length; index += 1) {
    if (bucketSets[MONTHLY_BUCKET_KEYS[index]].has(number)) return index;
  }
  return null;
};

const countStageIdmBuckets = (
  numbers: readonly number[],
  bucketSets: MonthlyBucketSets,
): number[] | null => {
  const counts = new Array(MONTHLY_BUCKET_KEYS.length).fill(0);
  for (const number of numbers) {
    const bucketIndex = bucketIndexForNumber(bucketSets, number);
    if (bucketIndex === null) return null;
    counts[bucketIndex] += 1;
  }
  return counts;
};

const sameCounts = (left: readonly number[], right: readonly number[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const stageIdmConstraintWarnings = (
  eligibleNumbers: readonly number[],
  stageIdm: NonNullable<PasteWeightedCandidateConstraints["stageIdm"]> | undefined,
  targetCounts: readonly number[],
): string[] => {
  if (!stageIdm?.enabled) return [];
  const warnings: string[] = [];
  const total = targetCounts.reduce((sum, value) => sum + value, 0);
  if (!stageIdm.bucketSets) {
    warnings.push("Stage IDM bucket data is unavailable, so the paste-weighted Stage IDM filter cannot run.");
    return warnings;
  }
  if (total !== MAIN_COUNT) {
    warnings.push("Stage IDM bucket mix must total exactly six mains before it can filter paste-weighted candidates.");
    return warnings;
  }

  const eligibleBucketCounts = new Array(MONTHLY_BUCKET_KEYS.length).fill(0);
  for (const number of eligibleNumbers) {
    const bucketIndex = bucketIndexForNumber(stageIdm.bucketSets, number);
    if (bucketIndex !== null) eligibleBucketCounts[bucketIndex] += 1;
  }
  targetCounts.forEach((target, index) => {
    if (target > eligibleBucketCounts[index]) {
      warnings.push(`Stage IDM ${bucketLabelForTimes(index)} needs ${target} main number${target === 1 ? "" : "s"}, but only ${eligibleBucketCounts[index]} eligible pasted number${eligibleBucketCounts[index] === 1 ? "" : "s"} are available in that bucket.`);
    }
  });
  return warnings;
};

const unsatisfiedPasteConstraintWarnings = (
  availableNumbers: number[],
  constraints: PasteWeightedCandidateConstraints,
): string[] => {
  const allowedNumbers = availableNumbers.filter((number) => isAllowedByExclusions(number, constraints));
  const warnings: string[] = [];

  if (allowedNumbers.length < MAIN_COUNT) {
    warnings.push("Active paste constraints leave fewer than six eligible numbers.");
  }
  if (constraints.ending5 === "require" && !hasAnyFromSet(allowedNumbers, ending5Set)) {
    warnings.push(`Ending 5 requires at least one of ${describeConstraintNumbers(PASTE_ENDING_5_NUMBERS)}, but none are available after exclusions.`);
  }
  if (constraints.ending0 === "require" && !hasAnyFromSet(allowedNumbers, ending0Set)) {
    warnings.push(`Ending 0 requires at least one of ${describeConstraintNumbers(PASTE_ENDING_0_NUMBERS)}, but none are available after exclusions.`);
  }

  return warnings;
};

const buildOddEvenRatioOptions = (rows: PastedCandidateRow[]): OddEvenRatioOption[] => {
  const exactRows = rows.filter((row) => row.expectedSixNumbers);
  const ratioCounts = new Map<string, number>();
  for (const row of exactRows) {
    const ratio = oddEvenRatioForNumbers(row.numbers);
    ratioCounts.set(ratio, (ratioCounts.get(ratio) ?? 0) + 1);
  }
  const total = exactRows.length;
  return [...ratioCounts.entries()]
    .map(([ratio, count]) => ({
      ratio,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.ratio.localeCompare(right.ratio));
};

const oddEvenConstraintWarnings = (
  eligibleNumbers: number[],
  selectedRatios: string[],
  quotas: Record<string, number>,
): string[] => {
  const warnings: string[] = [];
  const availableOddCount = eligibleNumbers.filter((number) => number % 2 !== 0).length;
  const availableEvenCount = eligibleNumbers.length - availableOddCount;

  for (const ratio of selectedRatios) {
    const quota = quotas[ratio] ?? 0;
    if (quota <= 0) continue;
    const parsedRatio = parseOddEvenRatio(ratio);
    if (!parsedRatio || parsedRatio.total !== MAIN_COUNT) {
      warnings.push(`Odd/even ratio ${ratio} is not valid for six main numbers.`);
      continue;
    }
    if (parsedRatio.odd > availableOddCount || parsedRatio.even > availableEvenCount) {
      warnings.push(`Odd/even ratio ${ratio} cannot be built from the eligible pasted-number pool.`);
    }
  }

  return warnings;
};

const adaptiveShapeConstraintWarnings = (
  selectedProfiles: string[],
  quotas: Record<string, number>,
): string[] => {
  const warnings: string[] = [];
  for (const profile of selectedProfiles) {
    const quota = quotas[profile] ?? 0;
    if (quota <= 0) continue;
    if (!/^S\d+:\d+ D\d+:\d+$/.test(profile)) {
      warnings.push(`Adaptive shape profile ${profile} is not valid for six main numbers.`);
    }
  }
  return warnings;
};

const shortfallWarnings = (
  quotas: Record<string, number>,
  acceptedRatios: Record<string, number>,
): string[] => Object.entries(quotas)
  .map(([ratio, quota]) => ({ ratio, missing: quota - (acceptedRatios[ratio] ?? 0) }))
  .filter(({ missing }) => missing > 0)
  .map(({ ratio, missing }) => `${ratio}:${missing}`);

const summarizeAdaptiveShapeNumbers = (
  numberSets: number[][],
  requested: number,
  totalAttempts: number,
  targetRatios?: Record<string, number>,
): OddEvenRatioSummary => {
  const acceptedRatios: Record<string, number> = {};
  for (const numbers of numberSets) {
    const profile = candidateShapeProfile(numbers);
    acceptedRatios[profile] = (acceptedRatios[profile] ?? 0) + 1;
  }
  return {
    requested,
    totalAccepted: numberSets.length,
    totalAttempts,
    acceptedRatios,
    ...(targetRatios ? { targetRatios } : {}),
  };
};

const summarizeStageIdmNumbers = (
  numberSets: number[][],
  bucketSets: MonthlyBucketSets | null | undefined,
  requested: number,
  totalAttempts: number,
  targetCounts: readonly number[],
): PasteWeightedStageIdmSummary => {
  const acceptedBucketCounts = new Array(MONTHLY_BUCKET_KEYS.length).fill(0);
  if (bucketSets) {
    for (const numbers of numberSets) {
      const counts = countStageIdmBuckets(numbers, bucketSets);
      if (!counts) continue;
      counts.forEach((count, index) => {
        acceptedBucketCounts[index] += count;
      });
    }
  }

  return {
    requested,
    totalAccepted: numberSets.length,
    totalAttempts,
    targetCounts: [...targetCounts],
    acceptedBucketCounts,
  };
};

export function parsePastedCandidateNumbers(input: string): PastedCandidateParseResult {
  const lines = input.split(/\r?\n/);
  const rows: PastedCandidateRow[] = [];
  const counts = new Map<number, number>();
  const invalidTokens: string[] = [];
  let totalCountedNumbers = 0;

  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;

    const numericTokens = numericTokensForLine(raw);
    if (isNumberedListLabel(raw, numericTokens, nextNonEmptyLine(lines, index))) return;

    const seen = new Set<number>();
    const duplicateSet = new Set<number>();
    const outOfRangeNumbers: number[] = [];
    const numbers: number[] = [];

    for (const token of numericTokens) {
      const value = Number(token);
      if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
        outOfRangeNumbers.push(value);
        invalidTokens.push(token);
        continue;
      }
      if (seen.has(value)) {
        duplicateSet.add(value);
        continue;
      }
      seen.add(value);
      numbers.push(value);
      counts.set(value, (counts.get(value) ?? 0) + 1);
      totalCountedNumbers += 1;
    }

    rows.push({
      lineNumber: index + 1,
      raw,
      numbers,
      duplicateNumbers: [...duplicateSet].sort((left, right) => left - right),
      outOfRangeNumbers,
      expectedSixNumbers: numbers.length === MAIN_COUNT && outOfRangeNumbers.length === 0,
    });
  });

  const rankedCounts = [...counts.entries()]
    .map(([number, count]) => ({
      number,
      count,
      share: totalCountedNumbers > 0 ? count / totalCountedNumbers : 0,
    }))
    .sort((left, right) => right.count - left.count || left.number - right.number);

  return {
    rows,
    acceptedRows: rows.filter((row) => row.numbers.length > 0).length,
    totalRows: rows.length,
    totalCountedNumbers,
    uniqueNumbers: rankedCounts.length,
    counts: rankedCounts,
    invalidTokens: [...new Set(invalidTokens)],
    oddEvenRatios: buildOddEvenRatioOptions(rows),
  };
}

export function generatePasteWeightedCandidates(
  input: string,
  options: {
    candidateCount: number;
    rng?: () => number;
    constraints?: PasteWeightedCandidateConstraints;
  },
): PasteWeightedGenerationResult {
  const parsed = parsePastedCandidateNumbers(input);
  const requestedCount = clampInteger(
    options.candidateCount,
    MIN_GENERATED_CANDIDATES,
    MAX_GENERATED_CANDIDATES,
  );
  const constraints = options.constraints ?? {};
  const oddEvenConstraint = constraints.oddEven;
  const adaptiveShapeConstraint = constraints.adaptiveShape;
  const stageIdmConstraint = constraints.stageIdm;
  const stageIdmTargetCounts = normalizeStageIdmTargetCounts(stageIdmConstraint?.targetCounts);
  const activeOddEvenRatios = (oddEvenConstraint?.selectedRatios ?? [])
    .map((ratio) => String(ratio ?? "").trim())
    .filter(Boolean);
  const activeAdaptiveProfiles = (adaptiveShapeConstraint?.profileOptions ?? [])
    .map((option) => String(option?.ratio ?? "").trim())
    .filter(Boolean);
  const warnings: string[] = [];

  if (parsed.uniqueNumbers < MAIN_COUNT) {
    return {
      ...parsed,
      candidates: [],
      warnings: ["Paste at least six distinct valid numbers before generating candidates."],
      oddEvenRatioSummary: oddEvenConstraint?.enabled
        ? summarizeOddEvenRatioNumbers([], requestedCount, 0)
        : undefined,
      adaptiveShapeSummary: adaptiveShapeConstraint?.enabled
        ? summarizeAdaptiveShapeNumbers([], requestedCount, 0)
        : undefined,
      stageIdmSummary: stageIdmConstraint?.enabled
        ? summarizeStageIdmNumbers([], stageIdmConstraint.bucketSets, requestedCount, 0, stageIdmTargetCounts)
        : undefined,
    };
  }

  const numbers = parsed.counts.map((item) => item.number);
  const weightByNumber = new Map(parsed.counts.map((item) => [item.number, item.count]));
  const constraintWarnings = unsatisfiedPasteConstraintWarnings(numbers, constraints);

  if (constraintWarnings.length > 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: constraintWarnings,
    };
  }

  const eligibleNumbers = numbers.filter((number) => isAllowedByExclusions(number, constraints));
  const eligibleWeights = eligibleNumbers.map((number) => weightByNumber.get(number) ?? 0);
  const stageIdmWarnings = stageIdmConstraint?.enabled
    ? stageIdmConstraintWarnings(eligibleNumbers, stageIdmConstraint, stageIdmTargetCounts)
    : [];
  if (stageIdmWarnings.length > 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: stageIdmWarnings,
      stageIdmSummary: summarizeStageIdmNumbers(
        [],
        stageIdmConstraint?.bucketSets,
        requestedCount,
        0,
        stageIdmTargetCounts,
      ),
    };
  }
  const oddEvenQuotas = oddEvenConstraint?.enabled
    ? buildOddEvenRatioQuotas(
      requestedCount,
      activeOddEvenRatios,
      oddEvenConstraint.ratioOptions ?? parsed.oddEvenRatios,
    )
    : {};
  const adaptiveShapeQuotas = adaptiveShapeConstraint?.enabled && adaptiveShapeConstraint.mode === "quota"
    ? buildOddEvenRatioQuotas(
      requestedCount,
      activeAdaptiveProfiles,
      adaptiveShapeConstraint.profileOptions,
    )
    : {};
  if (oddEvenConstraint?.enabled && activeOddEvenRatios.length === 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: ["Select at least one mains-only odd/even ratio before generating with the paste odd/even filter."],
      oddEvenRatioSummary: summarizeOddEvenRatioNumbers([], requestedCount, 0, oddEvenQuotas),
    };
  }
  if (adaptiveShapeConstraint?.enabled && adaptiveShapeConstraint.mode === "quota" && activeAdaptiveProfiles.length === 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: ["Adaptive shape quota mode needs at least one profile from the evidence engine."],
      adaptiveShapeSummary: summarizeAdaptiveShapeNumbers([], requestedCount, 0, adaptiveShapeQuotas),
    };
  }
  const oddEvenWarnings = oddEvenConstraint?.enabled
    ? oddEvenConstraintWarnings(eligibleNumbers, activeOddEvenRatios, oddEvenQuotas)
    : [];
  if (oddEvenWarnings.length > 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: oddEvenWarnings,
      oddEvenRatioSummary: summarizeOddEvenRatioNumbers([], requestedCount, 0, oddEvenQuotas),
    };
  }
  const adaptiveShapeWarnings = adaptiveShapeConstraint?.enabled && adaptiveShapeConstraint.mode === "quota"
    ? adaptiveShapeConstraintWarnings(activeAdaptiveProfiles, adaptiveShapeQuotas)
    : [];
  if (adaptiveShapeWarnings.length > 0) {
    return {
      ...parsed,
      candidates: [],
      warnings: adaptiveShapeWarnings,
      adaptiveShapeSummary: summarizeAdaptiveShapeNumbers([], requestedCount, 0, adaptiveShapeQuotas),
    };
  }
  const oddEvenQuotaCounts: Record<string, number> = {};
  const adaptiveShapeQuotaCounts: Record<string, number> = {};
  const rng = options.rng ?? Math.random;
  const maxUniqueCandidates = combinations(eligibleNumbers.length, MAIN_COUNT);
  const targetCount = Math.min(requestedCount, maxUniqueCandidates);
  const candidates: CandidateSet[] = [];
  const seenCandidates = new Set<string>();
  const hasQuotaConstraint = !!oddEvenConstraint?.enabled
    || (adaptiveShapeConstraint?.enabled && adaptiveShapeConstraint.mode === "quota")
    || !!stageIdmConstraint?.enabled;
  const attemptLimit = Math.max(1000, targetCount * (hasQuotaConstraint ? 1000 : 250));
  let attempts = 0;

  for (attempts = 0; candidates.length < targetCount && attempts < attemptLimit; attempts += 1) {
    const main = weightedSampleWithoutReplacement(eligibleNumbers, eligibleWeights, MAIN_COUNT, rng)
      .sort((left, right) => left - right);
    if (!candidateSatisfiesPasteConstraints(main, constraints)) continue;
    const oddEvenRatio = oddEvenConstraint?.enabled ? oddEvenRatioForNumbers(main) : null;
    if (oddEvenRatio) {
      const quota = oddEvenQuotas[oddEvenRatio] ?? 0;
      if (quota <= 0 || (oddEvenQuotaCounts[oddEvenRatio] ?? 0) >= quota) continue;
    }
    const adaptiveShapeProfile = adaptiveShapeConstraint?.enabled ? candidateShapeProfile(main) : null;
    if (adaptiveShapeProfile && adaptiveShapeConstraint?.mode === "quota") {
      const quota = adaptiveShapeQuotas[adaptiveShapeProfile] ?? 0;
      if (quota <= 0 || (adaptiveShapeQuotaCounts[adaptiveShapeProfile] ?? 0) >= quota) continue;
    }
    if (stageIdmConstraint?.enabled && stageIdmConstraint.bucketSets) {
      const stageCounts = countStageIdmBuckets(main, stageIdmConstraint.bucketSets);
      if (!stageCounts || !sameCounts(stageCounts, stageIdmTargetCounts)) continue;
    }
    const key = main.join(",");
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);
    const score = main.reduce((sum, number) => sum + (weightByNumber.get(number) ?? 0), 0);
    const trace = [`Paste-weighted score ${score.toFixed(0)} from pasted number counts.`];
    if (stageIdmConstraint?.enabled) {
      trace.push("Stage IDM bucket mix matched as an exact mains-only descriptive quota.");
    }
    candidates.push({
      main,
      supp: [],
      score,
      trace,
    });
    if (oddEvenRatio) {
      oddEvenQuotaCounts[oddEvenRatio] = (oddEvenQuotaCounts[oddEvenRatio] ?? 0) + 1;
    }
    if (adaptiveShapeProfile && adaptiveShapeConstraint?.mode === "quota") {
      adaptiveShapeQuotaCounts[adaptiveShapeProfile] = (adaptiveShapeQuotaCounts[adaptiveShapeProfile] ?? 0) + 1;
    }
  }

  const oddEvenRatioSummary = oddEvenConstraint?.enabled
    ? summarizeOddEvenRatioNumbers(
      candidates.map((candidate) => candidate.main),
      requestedCount,
      attempts,
      oddEvenQuotas,
    )
    : undefined;
  const adaptiveShapeSummary = adaptiveShapeConstraint?.enabled
    ? summarizeAdaptiveShapeNumbers(
      candidates.map((candidate) => candidate.main),
      requestedCount,
      attempts,
      adaptiveShapeConstraint.mode === "quota" ? adaptiveShapeQuotas : undefined,
    )
    : undefined;
  const stageIdmSummary = stageIdmConstraint?.enabled
    ? summarizeStageIdmNumbers(
      candidates.map((candidate) => candidate.main),
      stageIdmConstraint.bucketSets,
      requestedCount,
      attempts,
      stageIdmTargetCounts,
    )
    : undefined;

  if (candidates.length < requestedCount) {
    warnings.push(`Generated ${candidates.length} unique candidate${candidates.length === 1 ? "" : "s"} from the available pasted-number pool.`);
  }
  if (oddEvenRatioSummary?.targetRatios) {
    const shortfalls = shortfallWarnings(oddEvenRatioSummary.targetRatios, oddEvenRatioSummary.acceptedRatios);
    if (shortfalls.length > 0) {
      warnings.push(`Odd/even ratio quotas short by ${shortfalls.join(", ")}.`);
    }
  }
  if (adaptiveShapeSummary?.targetRatios) {
    const shortfalls = shortfallWarnings(adaptiveShapeSummary.targetRatios, adaptiveShapeSummary.acceptedRatios);
    if (shortfalls.length > 0) {
      warnings.push(`Adaptive shape quotas short by ${shortfalls.join(", ")}.`);
    }
  }
  if (parsed.invalidTokens.length > 0) {
    warnings.push(`Ignored out-of-range value${parsed.invalidTokens.length === 1 ? "" : "s"}: ${parsed.invalidTokens.join(", ")}.`);
  }

  return {
    ...parsed,
    candidates,
    warnings,
    oddEvenRatioSummary,
    adaptiveShapeSummary,
    stageIdmSummary,
  };
}
