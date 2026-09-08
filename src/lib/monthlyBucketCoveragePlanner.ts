import {
  MONTHLY_BUCKET_KEYS,
  bucketLabelForTimes,
  type MonthlyBucketKey,
  type MonthlyBucketSets,
  type MonthlyFrequencyConstraints,
} from "./monthlyDrawSummary";

export const BUCKET_COVERAGE_FULL_LIMIT = 5000;
export const BUCKET_COVERAGE_SAMPLED_LIMIT = 250000;
const BUCKET_COMBO_ENUM_LIMIT = 5000;
const DEFAULT_CANDIDATE_SLOTS = 8;

export type BucketCoveragePlannerStatus =
  | "inactive"
  | "unavailable"
  | "impossible"
  | "full"
  | "sampled"
  | "too-large";

export interface BucketCoveragePlannerOptions {
  enabled?: boolean;
  constraints?: MonthlyFrequencyConstraints | null;
  buckets?: MonthlyBucketSets | null;
  ignoredBucketKeys?: readonly MonthlyBucketKey[];
  excludedNumbers?: readonly number[];
  forcedNumbers?: readonly number[];
  requestedPoolSize?: number;
  candidateSlots?: number;
  maxFullCoverage?: number;
  maxSampledCoverage?: number;
}

export interface BucketCoveragePlannerBucketRow {
  key: MonthlyBucketKey;
  label: string;
  required: number;
  forcedCount: number;
  remainingRequired: number;
  availableCount: number;
  availableNumbers: number[];
  combinationCount: number;
  ignoredForCoverage: boolean;
}

export interface BucketCoveragePlannerPreview {
  enabled: boolean;
  status: BucketCoveragePlannerStatus;
  mode: "off" | "blocked" | "full" | "sampled";
  label: string;
  tone: "neutral" | "good" | "warn" | "bad";
  burden: number;
  requestedPoolSize: number;
  candidateSlots: number;
  requiredTotal: number;
  remainingRequiredTotal: number;
  plannedRequiredTotal: number;
  ignoredBucketKeys: MonthlyBucketKey[];
  maxFullCoverage: number;
  maxSampledCoverage: number;
  rows: BucketCoveragePlannerBucketRow[];
  reasons: string[];
  canGenerate: boolean;
}

export interface BucketCoverageGenerationPlan {
  preview: BucketCoveragePlannerPreview;
  next: (attemptIndex: number, random?: () => number) => Partial<Record<MonthlyBucketKey, number[]>>;
}

const bucketTimesForKey = (key: MonthlyBucketKey): number => (
  key === "undrawn" ? 0 : key === "times8" ? 8 : Number(key.replace("times", ""))
);

const bucketShortLabel = (key: MonthlyBucketKey): string => (
  key === "undrawn" ? "0x" : key === "times8" ? "8x+" : `${bucketTimesForKey(key)}x`
);

const safeInt = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
};

export const chooseBounded = (n: number, k: number, cap = Number.MAX_SAFE_INTEGER): number => {
  if (k < 0 || n < 0 || k > n) return 0;
  const normalizedK = Math.min(k, n - k);
  if (normalizedK === 0) return 1;
  let result = 1;
  for (let i = 1; i <= normalizedK; i += 1) {
    result = (result * (n - normalizedK + i)) / i;
    if (result > cap) return cap + 1;
  }
  return Math.round(result);
};

const boundedProduct = (values: number[], cap: number): number => {
  let product = 1;
  for (const value of values) {
    product *= Math.max(1, value);
    if (product > cap) return cap + 1;
  }
  return Math.round(product);
};

export function analyzeBucketCoveragePlanner(options: BucketCoveragePlannerOptions): BucketCoveragePlannerPreview {
  const candidateSlots = Math.max(1, safeInt(options.candidateSlots, DEFAULT_CANDIDATE_SLOTS));
  const requestedPoolSize = Math.max(0, safeInt(options.requestedPoolSize, 0));
  const maxFullCoverage = Math.max(1, safeInt(options.maxFullCoverage, BUCKET_COVERAGE_FULL_LIMIT));
  const maxSampledCoverage = Math.max(maxFullCoverage, safeInt(options.maxSampledCoverage, BUCKET_COVERAGE_SAMPLED_LIMIT));
  const ignoredBucketKeys = MONTHLY_BUCKET_KEYS.filter((key) => options.ignoredBucketKeys?.includes(key));
  const ignoredBucketKeySet = new Set<MonthlyBucketKey>(ignoredBucketKeys);
  const disabledBase: Omit<BucketCoveragePlannerPreview, "status" | "mode" | "label" | "tone" | "reasons" | "canGenerate"> = {
    enabled: !!options.enabled,
    burden: 0,
    requestedPoolSize,
    candidateSlots,
    requiredTotal: 0,
    remainingRequiredTotal: 0,
    plannedRequiredTotal: 0,
    ignoredBucketKeys,
    maxFullCoverage,
    maxSampledCoverage,
    rows: [],
  };

  if (!options.enabled) {
    return {
      ...disabledBase,
      status: "inactive",
      mode: "off",
      label: "Off",
      tone: "neutral",
      reasons: ["Bucket Coverage Planner is off."],
      canGenerate: false,
    };
  }

  if (!options.constraints || !options.buckets) {
    return {
      ...disabledBase,
      status: "unavailable",
      mode: "blocked",
      label: "Unavailable",
      tone: "bad",
      reasons: ["Acceptance Needs and current monthly bucket data are required."],
      canGenerate: false,
    };
  }

  const excludedSet = new Set(
    (options.excludedNumbers ?? [])
      .map((number) => Math.trunc(Number(number)))
      .filter((number) => number >= 1 && number <= 45),
  );
  const forcedSet = new Set(
    (options.forcedNumbers ?? [])
      .map((number) => Math.trunc(Number(number)))
      .filter((number) => number >= 1 && number <= 45 && !excludedSet.has(number)),
  );

  const rows: BucketCoveragePlannerBucketRow[] = MONTHLY_BUCKET_KEYS.map((key) => {
    const required = safeInt(options.constraints?.[key], 0);
    const bucket = options.buckets![key];
    const ignoredForCoverage = ignoredBucketKeySet.has(key);
    const forcedCount = Array.from(forcedSet).filter((number) => bucket.has(number)).length;
    const remainingRequired = Math.max(0, required - forcedCount);
    const availableNumbers = Array.from(bucket)
      .filter((number) => !excludedSet.has(number) && !forcedSet.has(number))
      .sort((left, right) => left - right);
    const combinationCount = chooseBounded(availableNumbers.length, remainingRequired, maxSampledCoverage);
    return {
      key,
      label: bucketLabelForTimes(bucketTimesForKey(key)),
      required,
      forcedCount,
      remainingRequired,
      availableCount: availableNumbers.length,
      availableNumbers,
      combinationCount,
      ignoredForCoverage,
    };
  });

  const requiredTotal = rows.reduce((sum, row) => sum + row.required, 0);
  const remainingRequiredTotal = rows.reduce((sum, row) => sum + row.remainingRequired, 0);
  const plannedRequiredTotal = rows.reduce(
    (sum, row) => sum + (row.ignoredForCoverage ? 0 : row.remainingRequired),
    0,
  );
  const base = {
    ...disabledBase,
    requiredTotal,
    remainingRequiredTotal,
    plannedRequiredTotal,
    rows,
  };

  if (requiredTotal <= 0) {
    return {
      ...base,
      status: "unavailable",
      mode: "blocked",
      label: "No bucket needs",
      tone: "neutral",
      reasons: ["No positive Acceptance Needs bucket counts are active."],
      canGenerate: false,
    };
  }

  if (requiredTotal > candidateSlots) {
    return {
      ...base,
      status: "impossible",
      mode: "blocked",
      label: "Impossible",
      tone: "bad",
      reasons: [`Acceptance Needs require ${requiredTotal}/${candidateSlots} candidate slots.`],
      canGenerate: false,
    };
  }

  const shortageRows = rows.filter((row) => row.availableCount < row.remainingRequired);
  if (shortageRows.length > 0) {
    return {
      ...base,
      status: "impossible",
      mode: "blocked",
      label: "Shortage",
      tone: "bad",
      reasons: shortageRows.map((row) => (
        `${bucketShortLabel(row.key)} needs ${row.remainingRequired} more, has ${row.availableCount} eligible`
      )),
      canGenerate: false,
    };
  }

  if (remainingRequiredTotal <= 0) {
    return {
      ...base,
      burden: 1,
      status: "unavailable",
      mode: "blocked",
      label: "Already satisfied",
      tone: "neutral",
      reasons: ["Forced numbers already satisfy the active bucket counts."],
      canGenerate: false,
    };
  }

  const ignoredRequiredRows = rows.filter((row) => row.ignoredForCoverage && row.remainingRequired > 0);
  const ignoredReason = ignoredRequiredRows.length > 0
    ? `${ignoredRequiredRows.map((row) => bucketShortLabel(row.key)).join(", ")} requirement${ignoredRequiredRows.length === 1 ? "" : "s"} still use standard random constructive fill and are excluded from the coverage burden.`
    : null;
  const plannedRows = rows.filter((row) => row.remainingRequired > 0 && !row.ignoredForCoverage);
  if (plannedRows.length === 0) {
    return {
      ...base,
      burden: 1,
      status: "unavailable",
      mode: "blocked",
      label: "Random only",
      tone: "neutral",
      reasons: [ignoredReason ?? "No non-ignored bucket requirements are active."],
      canGenerate: false,
    };
  }

  const activeComboCounts = rows
    .filter((row) => row.remainingRequired > 0 && !row.ignoredForCoverage)
    .map((row) => row.combinationCount);
  const burden = boundedProduct(activeComboCounts, maxSampledCoverage);
  const burdenBase = { ...base, burden };

  if (burden > maxSampledCoverage) {
    return {
      ...burdenBase,
      status: "too-large",
      mode: "blocked",
      label: "Coverage too large",
      tone: "bad",
      reasons: [
        `Coverage burden exceeds ${maxSampledCoverage.toLocaleString()} combinations.`,
        ...(ignoredReason ? [ignoredReason] : []),
      ],
      canGenerate: false,
    };
  }

  if (burden <= maxFullCoverage && requestedPoolSize >= burden) {
    return {
      ...burdenBase,
      status: "full",
      mode: "full",
      label: "Full coverage",
      tone: "good",
      reasons: [
        `The generation pool can cycle all ${burden.toLocaleString()} planned bucket combinations.`,
        ...(ignoredReason ? [ignoredReason] : []),
      ],
      canGenerate: true,
    };
  }

  return {
    ...burdenBase,
    status: "sampled",
    mode: "sampled",
    label: "Sampled coverage",
    tone: "warn",
    reasons: [
      burden > maxFullCoverage
        ? `Full coverage exceeds the ${maxFullCoverage.toLocaleString()} safe full-coverage limit.`
        : `Generation pool ${requestedPoolSize.toLocaleString()} is smaller than the ${burden.toLocaleString()} full-coverage burden.`,
      ...(ignoredReason ? [ignoredReason] : []),
    ],
    canGenerate: true,
  };
}

const enumerateCombinations = (numbers: readonly number[], k: number, maxRows: number): number[][] | null => {
  if (k < 0 || k > numbers.length) return null;
  if (k === 0) return [[]];
  if (chooseBounded(numbers.length, k, maxRows) > maxRows) return null;

  const result: number[][] = [];
  const combo: number[] = [];
  const visit = (start: number, remaining: number) => {
    if (result.length >= maxRows) return;
    if (remaining === 0) {
      result.push([...combo]);
      return;
    }
    for (let index = start; index <= numbers.length - remaining; index += 1) {
      combo.push(numbers[index]);
      visit(index + 1, remaining - 1);
      combo.pop();
    }
  };

  visit(0, k);
  return result;
};

const sampleWithoutReplacement = (numbers: readonly number[], k: number, random: () => number): number[] => {
  const pool = [...numbers];
  const output: number[] = [];
  while (output.length < k && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    output.push(pool[index]);
    pool.splice(index, 1);
  }
  return output.sort((left, right) => left - right);
};

const shufflePlans = (
  plans: Partial<Record<MonthlyBucketKey, number[]>>[],
  random: () => number,
): Partial<Record<MonthlyBucketKey, number[]>>[] => {
  const next = plans.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

export function buildBucketCoverageGenerationPlan(
  preview: BucketCoveragePlannerPreview,
  random: () => number = Math.random,
): BucketCoverageGenerationPlan | null {
  if (!preview.canGenerate) return null;
  const activeRows = preview.rows.filter((row) => row.remainingRequired > 0 && !row.ignoredForCoverage);
  if (activeRows.length === 0) return null;

  if (preview.mode === "full") {
    let plans: Partial<Record<MonthlyBucketKey, number[]>>[] = [{}];
    for (const row of activeRows) {
      const combos = enumerateCombinations(row.availableNumbers, row.remainingRequired, preview.maxFullCoverage);
      if (!combos) return null;
      const nextPlans: Partial<Record<MonthlyBucketKey, number[]>>[] = [];
      for (const plan of plans) {
        for (const combo of combos) {
          nextPlans.push({ ...plan, [row.key]: [...combo] });
          if (nextPlans.length > preview.maxFullCoverage) return null;
        }
      }
      plans = nextPlans;
    }
    const shuffledPlans = shufflePlans(plans, random);
    return {
      preview,
      next: (attemptIndex: number) => {
        const plan = shuffledPlans[Math.abs(Math.trunc(attemptIndex)) % shuffledPlans.length] ?? {};
        return MONTHLY_BUCKET_KEYS.reduce<Partial<Record<MonthlyBucketKey, number[]>>>((copy, key) => {
          if (plan[key]) copy[key] = [...plan[key]!];
          return copy;
        }, {});
      },
    };
  }

  const enumeratedByBucket = new Map<MonthlyBucketKey, number[][] | null>();
  for (const row of activeRows) {
    enumeratedByBucket.set(
      row.key,
      enumerateCombinations(row.availableNumbers, row.remainingRequired, BUCKET_COMBO_ENUM_LIMIT),
    );
  }

  return {
    preview,
    next: (attemptIndex: number, randomForAttempt: () => number = random) => {
      const plan: Partial<Record<MonthlyBucketKey, number[]>> = {};
      activeRows.forEach((row, rowIndex) => {
        const combos = enumeratedByBucket.get(row.key);
        if (combos && combos.length > 0) {
          plan[row.key] = [...combos[(Math.abs(Math.trunc(attemptIndex)) + rowIndex) % combos.length]];
          return;
        }
        plan[row.key] = sampleWithoutReplacement(row.availableNumbers, row.remainingRequired, randomForAttempt);
      });
      return plan;
    },
  };
}

export const formatBucketCoverageBurden = (burden: number): string => (
  burden > BUCKET_COVERAGE_SAMPLED_LIMIT ? `>${BUCKET_COVERAGE_SAMPLED_LIMIT.toLocaleString()}` : burden.toLocaleString()
);

export function formatBucketCoverageRows(rows: readonly BucketCoveragePlannerBucketRow[]): string {
  const parts = rows
    .filter((row) => row.required > 0)
    .map((row) => {
      if (row.ignoredForCoverage) {
        const forcedText = row.forcedCount > 0 ? `, forced ${row.forcedCount}` : "";
        return `${bucketShortLabel(row.key)} req ${row.required}${forcedText}, random fill (excluded from coverage burden)`;
      }
      const comboText = `C(${row.availableCount},${row.remainingRequired})=${row.combinationCount.toLocaleString()}`;
      const forcedText = row.forcedCount > 0 ? `, forced ${row.forcedCount}` : "";
      return `${bucketShortLabel(row.key)} req ${row.required}${forcedText}, ${comboText}`;
    });
  return parts.length ? parts.join(" · ") : "no positive bucket requirements";
}

export function formatBucketCoveragePlannerTrace(preview: BucketCoveragePlannerPreview): string {
  const rowText = formatBucketCoverageRows(preview.rows);
  const burdenText = preview.burden > 0 ? formatBucketCoverageBurden(preview.burden) : "n/a";
  const reasonText = preview.reasons.length ? ` ${preview.reasons.join(" ")}` : "";
  return `Bucket Coverage Planner ${preview.label}: burden ${burdenText}, pool ${preview.requestedPoolSize.toLocaleString()}, full limit ${preview.maxFullCoverage.toLocaleString()}, sampled limit ${preview.maxSampledCoverage.toLocaleString()} | ${rowText}.${reasonText}`;
}
