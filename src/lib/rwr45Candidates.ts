import type { CandidateSet } from "../types";

export const RWR45_CANDIDATE_COUNT = 7;
export const RWR45_MAIN_COUNT = 6;
export const RWR45_SUPP_COUNT = 2;
export const RWR45_POOL_SIZE = 45;

export interface RwR45GenerationResult {
  candidates: CandidateSet[];
  supplementaryPool: number[];
  traceLines: string[];
}

type RandomSource = () => number;

const ascendingNumbers = (values: readonly number[]): number[] => (
  [...values].sort((a, b) => a - b)
);

const randomIndex = (rng: RandomSource, upperExclusive: number): number => {
  const raw = rng();
  const finite = Number.isFinite(raw) ? raw : 0;
  const bounded = Math.min(Math.max(finite, 0), 0.999999999999);
  return Math.floor(bounded * upperExclusive);
};

const shuffled = (values: readonly number[], rng: RandomSource): number[] => {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(rng, index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const chooseTwoFromThree = (pool: readonly number[], rng: RandomSource): number[] => {
  if (pool.length !== 3) {
    throw new Error(`RwR45 supplementary pool must contain exactly 3 numbers; received ${pool.length}.`);
  }
  return ascendingNumbers(shuffled(pool, rng).slice(0, RWR45_SUPP_COUNT));
};

export function generateRwR45Candidates(rng: RandomSource = Math.random): RwR45GenerationResult {
  const shuffledPool = shuffled(
    Array.from({ length: RWR45_POOL_SIZE }, (_, index) => index + 1),
    rng,
  );
  const mainSlots = RWR45_CANDIDATE_COUNT * RWR45_MAIN_COUNT;
  const mainPool = shuffledPool.slice(0, mainSlots);
  const supplementaryPool = ascendingNumbers(shuffledPool.slice(mainSlots));

  const candidates = Array.from({ length: RWR45_CANDIDATE_COUNT }, (_, index): CandidateSet => {
    const start = index * RWR45_MAIN_COUNT;
    const main = ascendingNumbers(mainPool.slice(start, start + RWR45_MAIN_COUNT));
    const supp = chooseTwoFromThree(supplementaryPool, rng);
    return {
      main,
      supp,
      trace: [
        "PNUaRW45 random coverage row: six mains were assigned from the 42-number global no-replacement partition; supplementaries came from the leftover 3-number pool.",
      ],
    };
  });

  return {
    candidates,
    supplementaryPool,
    traceLines: [
      "[TRACE] RwR45 / PNUaRW45 active: Count ignored; generated exactly 7 candidates.",
      `[TRACE] PNUaRW45 partition: 42 globally unique mains across 7 rows; 3-number supplementary pool [${supplementaryPool.join(", ")}].`,
      "[TRACE] PNUaRW45 honesty note: this is uniform random coverage, not evidence weighting or a predictive score; normal generation filters are bypassed while the toggle is ON.",
    ],
  };
}
