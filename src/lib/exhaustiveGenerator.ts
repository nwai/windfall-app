import { CandidateSet } from "../types";

export interface ExhaustiveOptions {
  cap?: number;
  includeSupp?: boolean;
}

export interface ExhaustiveOutput {
  total: number;
  combos: CandidateSet[];
  capped: boolean;
}

const defaultCap = Number.POSITIVE_INFINITY;

/** Generate up to `cap` unique candidate combos (6 mains, 2 supps) from a pool of numbers. */
export function generateExhaustiveCombos(pool: number[], options: ExhaustiveOptions = {}): ExhaustiveOutput {
  const cap = options.cap ?? defaultCap;
  const sortedPool = Array.from(new Set(pool)).sort((a, b) => a - b);
  const n = sortedPool.length;
  const combos: CandidateSet[] = [];
  if (n < 8 || cap <= 0) return { total: 0, combos, capped: false };

  const total = combination(n, 6) * combination(n - 6, 2);
  const capLimit = Math.max(0, Math.floor(cap));

  const visitCombinations = (
    source: number[],
    size: number,
    visit: (combo: number[]) => boolean,
    start = 0,
    chosen: number[] = [],
  ): boolean => {
    if (chosen.length === size) return visit([...chosen]);
    const remaining = size - chosen.length;
    for (let index = start; index <= source.length - remaining; index++) {
      chosen.push(source[index]);
      if (!visitCombinations(source, size, visit, index + 1, chosen)) return false;
      chosen.pop();
    }
    return true;
  };

  visitCombinations(sortedPool, 6, (main) => {
    const mainSet = new Set(main);
    const suppPool = sortedPool.filter((n) => !mainSet.has(n));
    return visitCombinations(suppPool, 2, (supp) => {
      combos.push({ main, supp });
      return combos.length < capLimit;
    });
  });

  return { total, combos, capped: combos.length < total };
}

function combination(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  const k2 = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k2; i++) {
    result = (result * (n - (k2 - i))) / i;
  }
  return Math.round(result);
}
