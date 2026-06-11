import {
  bucketLabelForTimes,
  MONTHLY_BUCKET_KEYS,
  type MonthlyBucketKey,
  type MonthlyBucketSets,
} from "./monthlyDrawSummary";

const NUMBER_MIN = 1;
const NUMBER_MAX = 45;

export interface PortfolioMonthlyBucketNumberEvidence {
  number: number;
  bucketKey: MonthlyBucketKey | null;
  times: number | null;
  label: string;
  bucketSize: number;
}

export interface PortfolioMonthlyBucketCount {
  times: number;
  label: string;
  count: number;
}

export interface PortfolioMonthlyBucketSummary {
  coreBucketCounts: PortfolioMonthlyBucketCount[];
  alternateBucketCounts: PortfolioMonthlyBucketCount[];
  unknownCoreCount: number;
  totalKnownNumbers: number;
}

export interface PortfolioMonthlyBucketEvidence {
  available: boolean;
  reason?: string;
  summary: PortfolioMonthlyBucketSummary | null;
  numbersByNumber: Map<number, PortfolioMonthlyBucketNumberEvidence>;
}

const validNumber = (value: number): boolean => (
  Number.isInteger(value) && value >= NUMBER_MIN && value <= NUMBER_MAX
);

const normalizeNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(validNumber))).sort((left, right) => left - right)
);

const timesForBucketKey = (key: MonthlyBucketKey): number => {
  const index = MONTHLY_BUCKET_KEYS.indexOf(key);
  return index < 0 ? 0 : index;
};

const findBucketForNumber = (
  buckets: MonthlyBucketSets,
  number: number,
): PortfolioMonthlyBucketNumberEvidence => {
  for (const key of MONTHLY_BUCKET_KEYS) {
    if (!buckets[key].has(number)) continue;
    const times = timesForBucketKey(key);
    return {
      number,
      bucketKey: key,
      times,
      label: bucketLabelForTimes(times),
      bucketSize: buckets[key].size,
    };
  }

  return {
    number,
    bucketKey: null,
    times: null,
    label: "No bucket",
    bucketSize: 0,
  };
};

const buildCountsForNumbers = (
  numbers: readonly number[],
  evidenceByNumber: ReadonlyMap<number, PortfolioMonthlyBucketNumberEvidence>,
): PortfolioMonthlyBucketCount[] => {
  const counts = new Map<number, PortfolioMonthlyBucketCount>();
  for (const number of normalizeNumbers(numbers)) {
    const evidence = evidenceByNumber.get(number);
    if (!evidence || evidence.times === null) continue;
    const current = counts.get(evidence.times) ?? {
      times: evidence.times,
      label: evidence.label,
      count: 0,
    };
    current.count += 1;
    counts.set(evidence.times, current);
  }

  return [...counts.values()].sort((left, right) => left.times - right.times);
};

const totalKnownNumbersInBuckets = (buckets: MonthlyBucketSets): number => {
  const unique = new Set<number>();
  for (const key of MONTHLY_BUCKET_KEYS) {
    for (const number of buckets[key]) {
      if (validNumber(number)) unique.add(number);
    }
  }
  return unique.size;
};

export const buildPortfolioMonthlyBucketEvidence = (
  buckets: MonthlyBucketSets | null | undefined,
  coreNumbersInput: readonly number[],
  alternateNumbersInput: readonly number[],
): PortfolioMonthlyBucketEvidence => {
  if (!buckets) {
    return {
      available: false,
      reason: "No monthly bucket data is connected.",
      summary: null,
      numbersByNumber: new Map(),
    };
  }

  const totalKnownNumbers = totalKnownNumbersInBuckets(buckets);
  if (totalKnownNumbers === 0) {
    return {
      available: false,
      reason: "No monthly bucket data is connected.",
      summary: null,
      numbersByNumber: new Map(),
    };
  }

  const coreNumbers = normalizeNumbers(coreNumbersInput);
  const alternateNumbers = normalizeNumbers(alternateNumbersInput);
  const allNumbers = normalizeNumbers([...coreNumbers, ...alternateNumbers]);
  const numbersByNumber = new Map<number, PortfolioMonthlyBucketNumberEvidence>();
  for (const number of allNumbers) {
    numbersByNumber.set(number, findBucketForNumber(buckets, number));
  }

  const unknownCoreCount = coreNumbers.filter((number) => (
    numbersByNumber.get(number)?.times === null
  )).length;

  return {
    available: true,
    summary: {
      coreBucketCounts: buildCountsForNumbers(coreNumbers, numbersByNumber),
      alternateBucketCounts: buildCountsForNumbers(alternateNumbers, numbersByNumber),
      unknownCoreCount,
      totalKnownNumbers,
    },
    numbersByNumber,
  };
};
