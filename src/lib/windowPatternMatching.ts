import type { CandidateSet } from "../types";

export interface WindowPattern {
  low: number;
  high: number;
  odd: number;
  even: number;
  sum: number;
}

export function windowPatternForNumbers(numbers: readonly number[]): WindowPattern {
  const low = numbers.filter((number) => number <= 22).length;
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  return {
    low,
    high: numbers.length - low,
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
  };
}

export function countCandidateWindowPatternMatches(
  candidate: Pick<CandidateSet, "main" | "supp">,
  patterns: readonly WindowPattern[],
  sumTolerance = 0,
): number {
  const tolerance = Number.isFinite(sumTolerance) ? Math.max(0, Math.floor(sumTolerance)) : 0;
  const mains = windowPatternForNumbers(candidate.main);
  const all = windowPatternForNumbers([...candidate.main, ...candidate.supp]);
  const seen = new Set<string>();
  let matches = 0;
  for (const pattern of patterns) {
    const key = [pattern.low, pattern.high, pattern.odd, pattern.even, pattern.sum].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    // The captured row's counts preserve its six-main or eight-number scope.
    const count = pattern.low + pattern.high;
    const actual = count === candidate.main.length ? mains : all;
    if (count !== actual.low + actual.high) continue;
    if (pattern.low === actual.low && pattern.high === actual.high
      && pattern.odd === actual.odd && pattern.even === actual.even
      && Math.abs(pattern.sum - actual.sum) <= tolerance) matches += 1;
  }
  return matches;
}
