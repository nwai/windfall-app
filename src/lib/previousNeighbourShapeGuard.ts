import type { CandidateSet, Draw } from "../types";
import { sortDrawsChronologically } from "./recentDraws";

export type PreviousNeighbourShapeScope = "mains-plus-supps" | "mains";

export interface PreviousNeighbourShapeProfile {
  targetCount: number;
  singletonTargetCount: number;
  duplicateTargetCount: number;
  totalHits: number;
  singletonHits: number;
  duplicateHits: number;
  directRepeatHits: number;
  singletonHitNumbers: number[];
  duplicateHitNumbers: number[];
  directRepeatNumbers: number[];
}

export interface PreviousNeighbourShapeDistributionRow {
  count: number;
  observed: number;
  percent: number;
}

export interface PreviousNeighbourShapeQuotaPlan {
  transitionCount: number;
  quotas: Record<string, number>;
  distribution: PreviousNeighbourShapeDistributionRow[];
}

export interface PreviousNeighbourShapeQuotaResult {
  candidates: CandidateSet[];
  quotas: Record<string, number>;
  acceptedCounts: Record<string, number>;
  shortfalls: Record<string, number>;
}

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;

const validNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= LOTTERY_MIN &&
  value <= LOTTERY_MAX
);

const uniqueValidNumbers = (numbers: number[]): number[] => {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const number of numbers) {
    if (!validNumber(number) || seen.has(number)) continue;
    seen.add(number);
    output.push(number);
  }
  return output;
};

const numbersForScope = (draw: Draw, scope: PreviousNeighbourShapeScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const buildNeighbourBuckets = (previousNumbers: number[]) => {
  const targetSources = new Map<number, number[]>();
  for (const source of uniqueValidNumbers(previousNumbers)) {
    for (const target of [source - 1, source + 1]) {
      if (!validNumber(target)) continue;
      const sources = targetSources.get(target) ?? [];
      sources.push(source);
      targetSources.set(target, sources);
    }
  }

  const singletonTargets = new Set<number>();
  const duplicateTargets = new Set<number>();
  for (const [target, sources] of targetSources.entries()) {
    if (sources.length > 1) duplicateTargets.add(target);
    else singletonTargets.add(target);
  }

  return { singletonTargets, duplicateTargets };
};

export function buildPreviousNeighbourShapeProfile(
  previousNumbers: number[],
  candidateNumbers: number[],
): PreviousNeighbourShapeProfile {
  const previous = uniqueValidNumbers(previousNumbers);
  const candidate = uniqueValidNumbers(candidateNumbers);
  const previousSet = new Set(previous);
  const { singletonTargets, duplicateTargets } = buildNeighbourBuckets(previous);

  const singletonHitNumbers: number[] = [];
  const duplicateHitNumbers: number[] = [];
  const directRepeatNumbers: number[] = [];

  for (const number of candidate) {
    if (duplicateTargets.has(number)) duplicateHitNumbers.push(number);
    else if (singletonTargets.has(number)) singletonHitNumbers.push(number);
    if (previousSet.has(number)) directRepeatNumbers.push(number);
  }

  singletonHitNumbers.sort((left, right) => left - right);
  duplicateHitNumbers.sort((left, right) => left - right);
  directRepeatNumbers.sort((left, right) => left - right);

  return {
    targetCount: singletonTargets.size + duplicateTargets.size,
    singletonTargetCount: singletonTargets.size,
    duplicateTargetCount: duplicateTargets.size,
    totalHits: singletonHitNumbers.length + duplicateHitNumbers.length,
    singletonHits: singletonHitNumbers.length,
    duplicateHits: duplicateHitNumbers.length,
    directRepeatHits: directRepeatNumbers.length,
    singletonHitNumbers,
    duplicateHitNumbers,
    directRepeatNumbers,
  };
}

export function annotateCandidateWithPreviousNeighbourShape(
  candidate: CandidateSet,
  previousDraw: Draw | null | undefined,
  scope: PreviousNeighbourShapeScope = "mains-plus-supps",
): CandidateSet {
  if (!previousDraw) return candidate;
  const profile = buildPreviousNeighbourShapeProfile(
    numbersForScope(previousDraw, scope),
    scope === "mains" ? candidate.main : [...candidate.main, ...candidate.supp],
  );

  return {
    ...candidate,
    previousNeighbourHits: profile.totalHits,
    previousNeighbourDuplicateHits: profile.duplicateHits,
    previousNeighbourSingletonHits: profile.singletonHits,
    previousNeighbourTargetCount: profile.targetCount,
  };
}

export function annotateCandidatesWithPreviousNeighbourShape(
  candidates: CandidateSet[],
  previousDraw: Draw | null | undefined,
  scope: PreviousNeighbourShapeScope = "mains-plus-supps",
): CandidateSet[] {
  if (!previousDraw) return candidates;
  return candidates.map((candidate) => annotateCandidateWithPreviousNeighbourShape(candidate, previousDraw, scope));
}

export function buildPreviousNeighbourShapeDistribution(
  draws: Draw[],
  scope: PreviousNeighbourShapeScope = "mains-plus-supps",
): PreviousNeighbourShapeDistributionRow[] {
  const ordered = sortDrawsChronologically(draws)
    .map((draw) => ({ draw, numbers: uniqueValidNumbers(numbersForScope(draw, scope)) }))
    .filter(({ numbers }) => numbers.length === (scope === "mains" ? 6 : 8));

  const counts = new Map<number, number>();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const profile = buildPreviousNeighbourShapeProfile(previous.numbers, current.numbers);
    counts.set(profile.totalHits, (counts.get(profile.totalHits) ?? 0) + 1);
  }

  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];

  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([count, observed]) => ({
      count,
      observed,
      percent: (observed / total) * 100,
    }));
}

export function allocatePreviousNeighbourShapeQuotas(
  requested: number,
  distribution: Array<{ count: number; observed: number }>,
): Record<string, number> {
  const target = Math.max(0, Math.floor(requested));
  const observedTotal = distribution.reduce((sum, row) => sum + Math.max(0, row.observed), 0);
  if (target <= 0 || observedTotal <= 0) return {};

  const allocations = distribution
    .filter((row) => Number.isInteger(row.count) && row.count >= 0 && row.observed > 0)
    .map((row) => {
      const exact = (row.observed / observedTotal) * target;
      return {
        key: String(row.count),
        floor: Math.floor(exact),
        remainder: exact - Math.floor(exact),
        observed: row.observed,
      };
    });

  const quotas: Record<string, number> = {};
  let assigned = 0;
  for (const allocation of allocations) {
    quotas[allocation.key] = allocation.floor;
    assigned += allocation.floor;
  }

  const remaining = target - assigned;
  allocations
    .sort((left, right) => (
      right.remainder - left.remainder ||
      right.observed - left.observed ||
      Number(left.key) - Number(right.key)
    ))
    .slice(0, remaining)
    .forEach((allocation) => {
      quotas[allocation.key] = (quotas[allocation.key] ?? 0) + 1;
    });

  return Object.fromEntries(
    Object.entries(quotas)
      .filter(([, quota]) => quota > 0)
      .sort(([left], [right]) => Number(left) - Number(right)),
  );
}

export function buildPreviousNeighbourShapeQuotaPlan(
  requested: number,
  draws: Draw[],
  scope: PreviousNeighbourShapeScope = "mains-plus-supps",
): PreviousNeighbourShapeQuotaPlan {
  const distribution = buildPreviousNeighbourShapeDistribution(draws, scope);
  const transitionCount = distribution.reduce((sum, row) => sum + row.observed, 0);
  return {
    transitionCount,
    distribution,
    quotas: allocatePreviousNeighbourShapeQuotas(requested, distribution),
  };
}

export function applyPreviousNeighbourShapeQuotas(
  candidates: CandidateSet[],
  requested: number,
  quotas: Record<string, number>,
): PreviousNeighbourShapeQuotaResult {
  const target = Math.max(0, Math.floor(requested));
  const accepted: CandidateSet[] = [];
  const acceptedCounts: Record<string, number> = {};
  const eligibleKeys = new Set(Object.entries(quotas).filter(([, quota]) => quota > 0).map(([key]) => key));

  for (const candidate of candidates) {
    if (accepted.length >= target) break;
    const hitCount = candidate.previousNeighbourHits;
    if (!Number.isInteger(hitCount)) continue;
    const key = String(hitCount);
    if (!eligibleKeys.has(key)) continue;
    const quota = quotas[key] ?? 0;
    if ((acceptedCounts[key] ?? 0) >= quota) continue;
    accepted.push(candidate);
    acceptedCounts[key] = (acceptedCounts[key] ?? 0) + 1;
  }

  const shortfalls: Record<string, number> = {};
  for (const [key, quota] of Object.entries(quotas)) {
    const missing = quota - (acceptedCounts[key] ?? 0);
    if (missing > 0) shortfalls[key] = missing;
  }

  return {
    candidates: accepted,
    quotas,
    acceptedCounts,
    shortfalls,
  };
}

export function summarizePreviousNeighbourShapeQuotas(quotas: Record<string, number>): string {
  const entries = Object.entries(quotas).sort(([left], [right]) => Number(left) - Number(right));
  return entries.length ? entries.map(([hits, quota]) => `${hits} hit:${quota}`).join(", ") : "no quota";
}
