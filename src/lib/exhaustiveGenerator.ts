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

  // total combos without cap
  const total = combination(n, 6) * combination(n - 6, 2);

  // Simple lexicographic generation, short-circuited at cap
  outer: for (let a = 0; a <= n - 8; a++) {
    for (let b = a + 1; b <= n - 7; b++) {
      for (let c = b + 1; c <= n - 6; c++) {
        for (let d = c + 1; d <= n - 5; d++) {
          for (let e = d + 1; e <= n - 4; e++) {
            for (let f = e + 1; f <= n - 3; f++) {
              // mains are indices a..f; supps drawn from remaining indices > f
              for (let g = f + 1; g <= n - 2; g++) {
                for (let h = g + 1; h <= n - 1; h++) {
                  const main = [sortedPool[a], sortedPool[b], sortedPool[c], sortedPool[d], sortedPool[e], sortedPool[f]];
                  const supp = [sortedPool[g], sortedPool[h]];
                  combos.push({ main, supp });
                  if (combos.length >= cap) {
                    break outer;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

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
