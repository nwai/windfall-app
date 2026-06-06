import { weightedSampleWithoutReplacement } from "./weightedSample";

export interface BatesCandidate {
  main: number[];
  supp: number[];
  all: number[];
}

export interface BuildBatesCandidateOptions {
  weights: number[];
  forcedNumbers: number[];
  excludedNumbers: number[];
  rng?: () => number;
}

export type BuildBatesCandidateResult =
  | { ok: true; candidate: BatesCandidate; availableCount: number }
  | { ok: false; reason: string; availableCount: number };

export function buildBatesCandidate({
  weights,
  forcedNumbers,
  excludedNumbers,
  rng = Math.random,
}: BuildBatesCandidateOptions): BuildBatesCandidateResult {
  const forced = uniqueValidNumbers(forcedNumbers);
  const excluded = new Set(uniqueValidNumbers(excludedNumbers));

  if (forced.length > 8) {
    return {
      ok: false,
      reason: `Only 8 forced numbers can fit in one Bates ticket; ${forced.length} were selected.`,
      availableCount: forced.length,
    };
  }

  const pool = Array.from({ length: 45 }, (_, index) => index + 1).filter(
    (number) => !excluded.has(number) && !forced.includes(number),
  );
  const availableCount = forced.length + pool.length;
  if (availableCount < 8) {
    return {
      ok: false,
      reason: `Only ${availableCount} eligible numbers are available; 8 are required.`,
      availableCount,
    };
  }

  const normalizedWeights = normalizeCandidateWeights(weights);
  const poolWeights = pool.map((number) => normalizedWeights[number - 1]);
  const forcedMain = forced.slice(0, 6);
  const forcedSupp = forced.slice(6, 8);

  const pickedMain = weightedSampleWithoutReplacement(
    pool,
    poolWeights,
    Math.max(0, 6 - forcedMain.length),
    rng,
  );
  const remaining = pool.filter((number) => !pickedMain.includes(number));
  const remainingWeights = remaining.map((number) => normalizedWeights[number - 1]);
  const pickedSupp = weightedSampleWithoutReplacement(
    remaining,
    remainingWeights,
    Math.max(0, 2 - forcedSupp.length),
    rng,
  );

  const main = [...forcedMain, ...pickedMain].slice(0, 6).sort((a, b) => a - b);
  const supp = [...forcedSupp, ...pickedSupp].slice(0, 2).sort((a, b) => a - b);
  const all = [...main, ...supp];
  if (main.length !== 6 || supp.length !== 2 || new Set(all).size !== 8) {
    return {
      ok: false,
      reason: "Bates candidate construction did not produce eight unique numbers.",
      availableCount,
    };
  }

  return { ok: true, candidate: { main, supp, all }, availableCount };
}

export function uniqueValidNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const value of values) {
    const number = Math.round(value);
    if (!Number.isFinite(number) || number < 1 || number > 45 || seen.has(number)) continue;
    seen.add(number);
    output.push(number);
  }
  return output;
}

function normalizeCandidateWeights(weights: number[]): number[] {
  const clean = Array.from({ length: 45 }, (_, index) => {
    const weight = weights[index] ?? 0;
    return Number.isFinite(weight) ? Math.max(0, weight) : 0;
  });
  const sum = clean.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) return Array.from({ length: 45 }, () => 1 / 45);
  return clean.map((weight) => weight / sum);
}
