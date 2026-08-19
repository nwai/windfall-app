import type { CandidateSet } from "../types";
import type {
  MonthlyBucketKey,
  MonthlyBucketSets,
  MonthlyFrequencyConstraints,
} from "./monthlyDrawSummary";

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
  debug?: boolean;
  monthlyAcceptanceNeeds?: {
    constraints: MonthlyFrequencyConstraints;
    buckets: MonthlyBucketSets;
  };
}

type RandomSource = () => number;
type CandidateSection = "main" | "supp";

const MONTHLY_BUCKET_KEYS: MonthlyBucketKey[] = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
];

const MONTHLY_BUCKET_LABELS: Record<MonthlyBucketKey, string> = {
  undrawn: "0x",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};

type MonthlyCounts = Record<MonthlyBucketKey, number>;

interface MonthlyRepairResult {
  candidate: CandidateSet;
  repaired: boolean;
}

interface ReplacementTarget {
  section: CandidateSection;
  index: number;
  number: number;
  surplus: number;
}

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

const zeroMonthlyCounts = (): MonthlyCounts => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
});

const normalizeMonthlyConstraints = (
  constraints: MonthlyFrequencyConstraints,
): MonthlyFrequencyConstraints => {
  const normalized = zeroMonthlyCounts();
  for (const key of MONTHLY_BUCKET_KEYS) {
    const raw = constraints[key];
    normalized[key] = Number.isFinite(raw) ? Math.max(0, Math.min(8, Math.trunc(raw))) : 0;
  }
  return normalized;
};

const totalMonthlyConstraints = (constraints: MonthlyFrequencyConstraints): number => (
  MONTHLY_BUCKET_KEYS.reduce((sum, key) => sum + constraints[key], 0)
);

const hasMonthlyConstraints = (constraints: MonthlyFrequencyConstraints): boolean => (
  totalMonthlyConstraints(constraints) > 0
);

const formatMonthlyConstraints = (constraints: MonthlyFrequencyConstraints): string => (
  MONTHLY_BUCKET_KEYS
    .filter((key) => constraints[key] > 0)
    .map((key) => `${MONTHLY_BUCKET_LABELS[key]}≥${constraints[key]}`)
    .join(" · ") || "none"
);

const formatMonthlyCounts = (counts: MonthlyCounts): string => (
  MONTHLY_BUCKET_KEYS
    .map((key) => `${MONTHLY_BUCKET_LABELS[key]}:${counts[key]}`)
    .join(" ")
);

const monthlyBucketForNumber = (
  number: number,
  buckets: MonthlyBucketSets,
): MonthlyBucketKey | null => (
  MONTHLY_BUCKET_KEYS.find((key) => buckets[key].has(number)) ?? null
);

const countMonthlyBuckets = (
  numbers: readonly number[],
  buckets: MonthlyBucketSets,
): MonthlyCounts => {
  const counts = zeroMonthlyCounts();
  for (const number of numbers) {
    const bucket = monthlyBucketForNumber(number, buckets);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
};

const countsMeetMonthlyConstraints = (
  counts: MonthlyCounts,
  constraints: MonthlyFrequencyConstraints,
): boolean => (
  MONTHLY_BUCKET_KEYS.every((key) => counts[key] >= constraints[key])
);

const decrementMainUse = (mainUseCounts: Map<number, number>, number: number): void => {
  const next = (mainUseCounts.get(number) ?? 0) - 1;
  if (next <= 0) mainUseCounts.delete(number);
  else mainUseCounts.set(number, next);
};

const incrementMainUse = (mainUseCounts: Map<number, number>, number: number): void => {
  mainUseCounts.set(number, (mainUseCounts.get(number) ?? 0) + 1);
};

const monthlyAcceptanceBlockReason = (
  eligibleNumbers: readonly number[],
  forcedNumbers: readonly number[],
  monthlyAcceptanceNeeds: NonNullable<RwR45GenerationOptions["monthlyAcceptanceNeeds"]>,
): string | null => {
  const constraints = normalizeMonthlyConstraints(monthlyAcceptanceNeeds.constraints);
  const totalRequired = totalMonthlyConstraints(constraints);
  if (totalRequired > RWR45_MAIN_COUNT + RWR45_SUPP_COUNT) {
    return `requested ${totalRequired} bucket-required numbers per row, but each PNUaRW45 row has only 8 numbers`;
  }

  for (const key of MONTHLY_BUCKET_KEYS) {
    if (constraints[key] <= 0) continue;
    const eligibleInBucket = eligibleNumbers.filter((number) => monthlyAcceptanceNeeds.buckets[key].has(number));
    if (eligibleInBucket.length < constraints[key]) {
      return `${MONTHLY_BUCKET_LABELS[key]} requires ${constraints[key]} per row, but only ${eligibleInBucket.length} eligible numbers remain in that bucket`;
    }
  }

  if (forcedNumbers.length >= RWR45_MAIN_COUNT + RWR45_SUPP_COUNT) {
    const forcedCounts = countMonthlyBuckets(forcedNumbers, monthlyAcceptanceNeeds.buckets);
    if (!countsMeetMonthlyConstraints(forcedCounts, constraints)) {
      return "all 8 row slots are already occupied by forced inclusions that do not meet the selected bucket counts";
    }
  }

  return null;
};

const buildMainUseCounts = (candidates: readonly CandidateSet[]): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    for (const number of candidate.main) incrementMainUse(counts, number);
  }
  return counts;
};

const buildNumberUseCounts = (candidates: readonly CandidateSet[]): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    for (const number of [...candidate.main, ...candidate.supp]) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  return counts;
};

const decrementNumberUse = (numberUseCounts: Map<number, number>, number: number): void => {
  const next = (numberUseCounts.get(number) ?? 0) - 1;
  if (next <= 0) numberUseCounts.delete(number);
  else numberUseCounts.set(number, next);
};

const incrementNumberUse = (numberUseCounts: Map<number, number>, number: number): void => {
  numberUseCounts.set(number, (numberUseCounts.get(number) ?? 0) + 1);
};

const chooseLeastUsedFromPool = (
  pool: readonly number[],
  rng: RandomSource,
  numberUseCounts: Map<number, number>,
): number | undefined => {
  if (!pool.length) return undefined;
  let lowest = Infinity;
  for (const number of pool) lowest = Math.min(lowest, numberUseCounts.get(number) ?? 0);
  const leastUsed = pool.filter((number) => (numberUseCounts.get(number) ?? 0) === lowest);
  return chooseFromPool(leastUsed, 1, rng)[0];
};

const replacementTargets = (
  main: readonly number[],
  supp: readonly number[],
  counts: MonthlyCounts,
  constraints: MonthlyFrequencyConstraints,
  buckets: MonthlyBucketSets,
  forcedSet: ReadonlySet<number>,
): ReplacementTarget[] => {
  const entries: ReplacementTarget[] = [];
  const addTargets = (section: CandidateSection, values: readonly number[]) => {
    values.forEach((number, index) => {
      if (forcedSet.has(number)) return;
      const bucket = monthlyBucketForNumber(number, buckets);
      const surplus = bucket ? counts[bucket] - constraints[bucket] : 1;
      if (surplus <= 0) return;
      entries.push({ section, index, number, surplus });
    });
  };

  addTargets("supp", supp);
  addTargets("main", main);
  return entries.sort((left, right) => {
    if (left.section !== right.section) return left.section === "supp" ? -1 : 1;
    return right.surplus - left.surplus || left.number - right.number;
  });
};

const repairCandidateForMonthlyAcceptanceNeeds = (
  candidate: CandidateSet,
  rng: RandomSource,
  context: {
    eligibleNumbers: readonly number[];
    forcedSet: ReadonlySet<number>;
    mainUseCounts: Map<number, number>;
    numberUseCounts: Map<number, number>;
    monthlyAcceptanceNeeds: NonNullable<RwR45GenerationOptions["monthlyAcceptanceNeeds"]>;
  },
): MonthlyRepairResult | null => {
  const constraints = normalizeMonthlyConstraints(context.monthlyAcceptanceNeeds.constraints);
  let main = [...candidate.main];
  let supp = [...candidate.supp];
  let repaired = false;

  for (let attempt = 0; attempt < RWR45_MAIN_COUNT + RWR45_SUPP_COUNT + 1; attempt += 1) {
    const rowNumbers = [...main, ...supp];
    const counts = countMonthlyBuckets(rowNumbers, context.monthlyAcceptanceNeeds.buckets);
    if (countsMeetMonthlyConstraints(counts, constraints)) {
      return {
        candidate: {
          ...candidate,
          main: ascendingNumbers(main),
          supp: ascendingNumbers(supp),
          trace: [
            ...(candidate.trace ?? []),
            repaired
              ? "PNUaRW45 monthly Acceptance Needs repair: row-safe swaps were used so this row meets the selected bucket minimums."
              : "PNUaRW45 monthly Acceptance Needs check: this row already met the selected bucket minimums.",
          ],
        },
        repaired,
      };
    }

    const missingBucket = MONTHLY_BUCKET_KEYS.find((key) => counts[key] < constraints[key]);
    if (!missingBucket) return null;

    const rowSet = new Set(rowNumbers);
    const basePool = context.eligibleNumbers.filter((number) => (
      context.monthlyAcceptanceNeeds.buckets[missingBucket].has(number) && !rowSet.has(number)
    ));
    if (!basePool.length) return null;

    const targets = replacementTargets(
      main,
      supp,
      counts,
      constraints,
      context.monthlyAcceptanceNeeds.buckets,
      context.forcedSet,
    );
    if (!targets.length) return null;

    const target = targets[0];
    if (target.section === "main") {
      const preferred = basePool.filter((number) => (context.mainUseCounts.get(number) ?? 0) === 0);
      const replacement = chooseLeastUsedFromPool(preferred.length ? preferred : basePool, rng, context.numberUseCounts);
      if (!replacement) return null;
      decrementMainUse(context.mainUseCounts, target.number);
      incrementMainUse(context.mainUseCounts, replacement);
      decrementNumberUse(context.numberUseCounts, target.number);
      incrementNumberUse(context.numberUseCounts, replacement);
      main[target.index] = replacement;
    } else {
      const replacement = chooseLeastUsedFromPool(basePool, rng, context.numberUseCounts);
      if (!replacement) return null;
      decrementNumberUse(context.numberUseCounts, target.number);
      incrementNumberUse(context.numberUseCounts, replacement);
      supp[target.index] = replacement;
    }
    repaired = true;
  }

  return null;
};

const buildMonthlyQuotaPressureTraceLines = (
  eligibleNumbers: readonly number[],
  monthlyAcceptanceNeeds: NonNullable<RwR45GenerationOptions["monthlyAcceptanceNeeds"]>,
): string[] => {
  const constraints = normalizeMonthlyConstraints(monthlyAcceptanceNeeds.constraints);
  const lines: string[] = [];

  for (const key of MONTHLY_BUCKET_KEYS) {
    const required = constraints[key];
    if (required <= 0) continue;

    const eligibleInBucket = ascendingNumbers(
      eligibleNumbers.filter((number) => monthlyAcceptanceNeeds.buckets[key].has(number)),
    );
    const demand = required * RWR45_CANDIDATE_COUNT;
    const label = MONTHLY_BUCKET_LABELS[key];
    lines.push(
      `[TRACE] PNUaRW45 monthly bucket inventory: ${label}≥${required}; eligible=${eligibleInBucket.length} ${formatNumbers(eligibleInBucket)}; 7-row demand=${demand}.`,
    );

    if (eligibleInBucket.length === required) {
      lines.push(
        `[TRACE] PNUaRW45 monthly quota pressure: ${label}≥${required} has exactly ${eligibleInBucket.length} eligible number${eligibleInBucket.length === 1 ? "" : "s"} ${formatNumbers(eligibleInBucket)}, so every row must include ${formatNumbers(eligibleInBucket)}. This is quota pressure, not number strength.`,
      );
    } else if (eligibleInBucket.length < demand) {
      lines.push(
        `[TRACE] PNUaRW45 monthly quota pressure: ${label}≥${required} needs ${demand} placements across 7 rows but only ${eligibleInBucket.length} eligible numbers ${formatNumbers(eligibleInBucket)}; repeated use is mathematically unavoidable.`,
      );
    }
  }

  return lines;
};

const buildGeneratedPoolConcentrationTraceLines = (
  candidates: readonly CandidateSet[],
  buckets?: MonthlyBucketSets,
): string[] => {
  const counts = new Map<number, { main: number; supp: number }>();
  for (const candidate of candidates) {
    for (const number of candidate.main) {
      const current = counts.get(number) ?? { main: 0, supp: 0 };
      current.main += 1;
      counts.set(number, current);
    }
    for (const number of candidate.supp) {
      const current = counts.get(number) ?? { main: 0, supp: 0 };
      current.supp += 1;
      counts.set(number, current);
    }
  }

  const repeated = Array.from(counts.entries())
    .map(([number, value]) => ({
      number,
      main: value.main,
      supp: value.supp,
      total: value.main + value.supp,
      bucket: buckets ? monthlyBucketForNumber(number, buckets) : null,
    }))
    .filter((entry) => entry.total >= 4)
    .sort((left, right) => right.total - left.total || left.number - right.number);

  if (!repeated.length) return [];

  const summary = repeated.map((entry) => {
    const bucket = entry.bucket ? `, ${MONTHLY_BUCKET_LABELS[entry.bucket]}` : "";
    return `${entry.number} x${entry.total} (main ${entry.main}, supp ${entry.supp}${bucket})`;
  }).join(" · ");

  return [
    `[TRACE] PNUaRW45 generated-pool concentration: ${summary}. These are displayed-row counts, not evidence scores.`,
  ];
};

const buildDebugRowTraceLines = (
  candidates: readonly CandidateSet[],
  monthlyAcceptanceNeeds?: NonNullable<RwR45GenerationOptions["monthlyAcceptanceNeeds"]>,
): string[] => candidates.map((candidate, index) => {
  const bucketSummary = monthlyAcceptanceNeeds
    ? ` · buckets ${formatMonthlyCounts(countMonthlyBuckets([...candidate.main, ...candidate.supp], monthlyAcceptanceNeeds.buckets))}`
    : "";
  const rowTrace = candidate.trace?.length ? ` · row trace: ${candidate.trace.join(" | ")}` : "";
  return `[TRACE] PNUaRW45 row ${index + 1}: main ${formatNumbers(candidate.main)} · supp ${formatNumbers(candidate.supp)}${bucketSummary}${rowTrace}`;
});

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
  const monthlyAcceptanceNeeds = options.monthlyAcceptanceNeeds
    ? {
      ...options.monthlyAcceptanceNeeds,
      constraints: normalizeMonthlyConstraints(options.monthlyAcceptanceNeeds.constraints),
    }
    : undefined;

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

  if (monthlyAcceptanceNeeds && hasMonthlyConstraints(monthlyAcceptanceNeeds.constraints)) {
    const blockReason = monthlyAcceptanceBlockReason(eligibleNumbers, forcedNumbers, monthlyAcceptanceNeeds);
    if (blockReason) {
      return {
        candidates: [],
        supplementaryPool: [],
        traceLines: [
          "[TRACE] RwR45 / PNUaRW45 active: Count ignored; no candidates generated.",
          `[TRACE] PNUaRW45 monthly Acceptance Needs blocked: ${blockReason}.`,
          `[TRACE] PNUaRW45 monthly Acceptance Needs requested: ${formatMonthlyConstraints(monthlyAcceptanceNeeds.constraints)}.`,
        ],
      };
    }
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
  let partitionFallbackUsed = usedRowSafeFallback;

  let candidates = Array.from({ length: RWR45_CANDIDATE_COUNT }, (): CandidateSet => {
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
      partitionFallbackUsed = true;
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
        partitionFallbackUsed = true;
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

  let monthlyAcceptanceRepairCount = 0;
  if (monthlyAcceptanceNeeds && hasMonthlyConstraints(monthlyAcceptanceNeeds.constraints)) {
    const mainUseCounts = buildMainUseCounts(candidates);
    const numberUseCounts = buildNumberUseCounts(candidates);
    const repairedCandidates: CandidateSet[] = [];
    for (const candidate of candidates) {
      const repaired = repairCandidateForMonthlyAcceptanceNeeds(candidate, rng, {
        eligibleNumbers,
        forcedSet,
        mainUseCounts,
        numberUseCounts,
        monthlyAcceptanceNeeds,
      });
      if (!repaired) {
        return {
          candidates: [],
          supplementaryPool: [],
          traceLines: [
            "[TRACE] RwR45 / PNUaRW45 active: Count ignored; no candidates generated.",
            `[TRACE] PNUaRW45 monthly Acceptance Needs blocked: row-safe repair could not satisfy ${formatMonthlyConstraints(monthlyAcceptanceNeeds.constraints)} without breaking forced inclusions/exclusions or row uniqueness.`,
          ],
        };
      }
      if (repaired.repaired) monthlyAcceptanceRepairCount += 1;
      repairedCandidates.push(repaired.candidate);
    }
    candidates = repairedCandidates;
    if (monthlyAcceptanceRepairCount > 0) usedRowSafeFallback = true;
  }

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
  if (monthlyAcceptanceNeeds && hasMonthlyConstraints(monthlyAcceptanceNeeds.constraints)) {
    traceLines.push(
      `[TRACE] PNUaRW45 monthly Acceptance Needs honored: ${formatMonthlyConstraints(monthlyAcceptanceNeeds.constraints)} checked against all 8 numbers in every row.`,
    );
    traceLines.push(...buildMonthlyQuotaPressureTraceLines(eligibleNumbers, monthlyAcceptanceNeeds));
    if (monthlyAcceptanceRepairCount > 0) {
      traceLines.push(
        `[TRACE] PNUaRW45 monthly Acceptance Needs repair: ${monthlyAcceptanceRepairCount} row${monthlyAcceptanceRepairCount === 1 ? "" : "s"} needed row-safe swaps, so strict global main coverage may be reduced where the bucket minimums required it.`,
      );
    }
  }

  const partitionDescription = forcedNumbers.length > 0 || excludedNumbers.length > 0
    ? `[TRACE] PNUaRW45 forced-aware partition: ${globalMainFillPool.length} globally unique non-forced main filler numbers across 7 rows; forced mains repeat in each row${forcedMain.length ? ` ${formatNumbers(forcedMain)}` : ""}; preferred supplementary pool ${formatNumbers(supplementaryPool)}.`
    : `[TRACE] PNUaRW45 partition: 42 globally unique mains across 7 rows; 3-number supplementary pool [${supplementaryPool.join(", ")}].`;
  traceLines.push(partitionDescription);

  if (usedRowSafeFallback) {
    const fallbackReasons = [
      partitionFallbackUsed ? "active exclusions/forced numbers limited the strict 42-main partition or preferred supplementary pool" : "",
      monthlyAcceptanceRepairCount > 0 ? "monthly Acceptance Needs repair changed one or more row slots" : "",
    ].filter(Boolean);
    traceLines.push(
      `[TRACE] PNUaRW45 row-safe fallback/adjustment used: ${fallbackReasons.join("; ") || "row-safe filling was required"}; row uniqueness was preserved, but global repeat counts may increase.`,
    );
  }

  traceLines.push(...buildGeneratedPoolConcentrationTraceLines(
    candidates,
    monthlyAcceptanceNeeds?.buckets,
  ));
  if (options.debug) {
    traceLines.push(...buildDebugRowTraceLines(candidates, monthlyAcceptanceNeeds));
  }

  traceLines.push(
    forcedNumbers.length > 0 || excludedNumbers.length > 0 || (monthlyAcceptanceNeeds && hasMonthlyConstraints(monthlyAcceptanceNeeds.constraints))
      ? "[TRACE] PNUaRW45 honesty note: this is still random coverage, not evidence weighting or a predictive score; active hard inclusions/exclusions and checked Acceptance Needs counts are honored before display."
      : "[TRACE] PNUaRW45 honesty note: this is uniform random coverage, not evidence weighting or a predictive score; normal evidence filters are bypassed while the toggle is ON.",
  );

  return {
    candidates,
    supplementaryPool: monthlyAcceptanceNeeds && hasMonthlyConstraints(monthlyAcceptanceNeeds.constraints)
      ? ascendingNumbers(Array.from(new Set(candidates.flatMap((candidate) => candidate.supp))))
      : supplementaryPool,
    traceLines,
  };
}
