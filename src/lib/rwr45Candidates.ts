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

export interface RwR45GenerationOptions {
  forcedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
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

const normalizeNumbers = (values: readonly number[] | undefined): number[] => {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isInteger(value) || value < 1 || value > RWR45_POOL_SIZE || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
};

const chooseFromPool = (
  pool: readonly number[],
  count: number,
  rng: RandomSource,
): number[] => {
  if (count <= 0) return [];
  return shuffled(pool, rng).slice(0, count);
};

const formatNumbers = (values: readonly number[]): string => (
  values.length ? `[${ascendingNumbers(values).join(", ")}]` : "[]"
);

export function generateRwR45Candidates(
  rng: RandomSource = Math.random,
  options: RwR45GenerationOptions = {},
): RwR45GenerationResult {
  const excludedNumbers = ascendingNumbers(normalizeNumbers(options.excludedNumbers));
  const excludedSet = new Set(excludedNumbers);
  const forcedRequested = normalizeNumbers(options.forcedNumbers);
  const forcedRemovedByExclusion = forcedRequested.filter((number) => excludedSet.has(number));
  const forcedEligible = forcedRequested.filter((number) => !excludedSet.has(number));
  const forcedNumbers = forcedEligible.slice(0, RWR45_MAIN_COUNT + RWR45_SUPP_COUNT);
  const forcedOverflow = forcedEligible.slice(RWR45_MAIN_COUNT + RWR45_SUPP_COUNT);
  const forcedSet = new Set(forcedNumbers);
  const forcedMain = forcedNumbers.slice(0, RWR45_MAIN_COUNT);
  const forcedSupp = forcedNumbers.slice(RWR45_MAIN_COUNT, RWR45_MAIN_COUNT + RWR45_SUPP_COUNT);
  const eligibleNumbers = Array.from({ length: RWR45_POOL_SIZE }, (_, index) => index + 1)
    .filter((number) => !excludedSet.has(number));

  if (eligibleNumbers.length < RWR45_MAIN_COUNT + RWR45_SUPP_COUNT) {
    return {
      candidates: [],
      supplementaryPool: [],
      traceLines: [
        "[TRACE] RwR45 / PNUaRW45 active: Count ignored; no candidates generated.",
        `[TRACE] PNUaRW45 blocked: only ${eligibleNumbers.length} eligible numbers remain after exclusions; 8 are required for each candidate.`,
      ],
    };
  }

  const mainFillSlotsPerCandidate = RWR45_MAIN_COUNT - forcedMain.length;
  const totalMainFillSlots = RWR45_CANDIDATE_COUNT * mainFillSlotsPerCandidate;
  const shuffledFillable = shuffled(
    eligibleNumbers.filter((number) => !forcedSet.has(number)),
    rng,
  );
  const globalMainFillPool = shuffledFillable.slice(0, Math.min(totalMainFillSlots, shuffledFillable.length));
  const supplementaryPool = ascendingNumbers(shuffledFillable.slice(globalMainFillPool.length));
  let globalMainFillCursor = 0;
  let usedRowSafeFallback = globalMainFillPool.length < totalMainFillSlots;

  const candidates = Array.from({ length: RWR45_CANDIDATE_COUNT }, (_, index): CandidateSet => {
    const main: number[] = [...forcedMain];
    const supp: number[] = [...forcedSupp];
    const mainFillNeeded = RWR45_MAIN_COUNT - main.length;
    const globalMainFill = globalMainFillPool.slice(
      globalMainFillCursor,
      globalMainFillCursor + mainFillNeeded,
    );
    globalMainFillCursor += globalMainFill.length;
    main.push(...globalMainFill);

    if (main.length < RWR45_MAIN_COUNT) {
      usedRowSafeFallback = true;
      const rowSafeMainPool = eligibleNumbers.filter((number) => !main.includes(number) && !supp.includes(number));
      main.push(...chooseFromPool(rowSafeMainPool, RWR45_MAIN_COUNT - main.length, rng));
    }

    const suppFillNeeded = RWR45_SUPP_COUNT - supp.length;
    if (suppFillNeeded > 0) {
      const usedForCandidate = new Set([...main, ...supp]);
      const preferredSuppPool = supplementaryPool.filter((number) => !usedForCandidate.has(number));
      const preferredSuppFill = chooseFromPool(preferredSuppPool, suppFillNeeded, rng);
      supp.push(...preferredSuppFill);

      if (supp.length < RWR45_SUPP_COUNT) {
        usedRowSafeFallback = true;
        const rowSafeSuppPool = eligibleNumbers.filter((number) => !main.includes(number) && !supp.includes(number));
        supp.push(...chooseFromPool(rowSafeSuppPool, RWR45_SUPP_COUNT - supp.length, rng));
      }
    }

    return {
      main: ascendingNumbers(main),
      supp: ascendingNumbers(supp),
      trace: [
        forcedNumbers.length > 0 || excludedNumbers.length > 0
          ? "PNUaRW45 forced-aware row: forced inclusions were seeded first, exclusions were removed, and remaining main slots used random coverage where possible."
          : "PNUaRW45 random coverage row: six mains were assigned from the 42-number global no-replacement partition; supplementaries came from the leftover 3-number pool.",
      ],
    };
  });

  const traceLines = [
    "[TRACE] RwR45 / PNUaRW45 active: Count ignored; generated exactly 7 candidates.",
  ];

  if (forcedNumbers.length > 0 || excludedNumbers.length > 0) {
    traceLines.push(
      `[TRACE] PNUaRW45 forced-aware constraints: forced=${forcedNumbers.length}${forcedNumbers.length ? ` ${formatNumbers(forcedNumbers)}` : ""}; exclusions=${excludedNumbers.length}${excludedNumbers.length ? ` ${formatNumbers(excludedNumbers)}` : ""}.`,
    );
  }
  if (forcedRemovedByExclusion.length > 0) {
    traceLines.push(
      `[TRACE] PNUaRW45 exclusions overrode forced inclusions: removed ${formatNumbers(forcedRemovedByExclusion)}.`,
    );
  }
  if (forcedOverflow.length > 0) {
    traceLines.push(
      `[TRACE] PNUaRW45 ignored forced inclusions beyond the 8-number candidate capacity: ${formatNumbers(forcedOverflow)}.`,
    );
  }

  const partitionDescription = forcedNumbers.length > 0 || excludedNumbers.length > 0
    ? `[TRACE] PNUaRW45 forced-aware partition: ${globalMainFillPool.length} globally unique non-forced main filler numbers across 7 rows; forced mains repeat in each row${forcedMain.length ? ` ${formatNumbers(forcedMain)}` : ""}; preferred supplementary pool ${formatNumbers(supplementaryPool)}.`
    : `[TRACE] PNUaRW45 partition: 42 globally unique mains across 7 rows; 3-number supplementary pool [${supplementaryPool.join(", ")}].`;
  traceLines.push(partitionDescription);

  if (usedRowSafeFallback) {
    traceLines.push(
      "[TRACE] PNUaRW45 row-safe fallback used: active exclusions/forced numbers made the original strict 42-main partition or preferred supplementary pool too small, so remaining row slots were filled from eligible non-excluded numbers without duplicating within a row.",
    );
  }

  traceLines.push(
    forcedNumbers.length > 0 || excludedNumbers.length > 0
      ? "[TRACE] PNUaRW45 honesty note: this is still random coverage, not evidence weighting or a predictive score; active hard inclusions/exclusions are honored before random fill."
      : "[TRACE] PNUaRW45 honesty note: this is uniform random coverage, not evidence weighting or a predictive score; normal evidence filters are bypassed while the toggle is ON.",
  );

  return {
    candidates,
    supplementaryPool,
    traceLines,
  };
}
