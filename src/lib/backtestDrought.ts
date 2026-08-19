// Backtest support for DGA drought-break empirical shortlist.
// Uses the same computeDroughtHazard model displayed in the DGA panel. For each
// eligible timepoint, it ranks numbers from history available up to that point
// and checks whether the next draw contains any ranked numbers.

import { Draw } from "../types";
import {
  computeDroughtHazard,
  computeStrictDroughtShortlist,
  DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
  STRICT_DROUGHT_DEFAULT_THRESHOLD,
} from "./droughtHazard";

export type BacktestOptions = {
  minHistory?: number;      // minimum number of draws before we start predicting (default 20)
  useRollingWindow?: boolean; // whether to use only the last windowSize draws when computing signal
  windowSize?: number;      // relevant if useRollingWindow true (default 180)
  topK?: number;            // how many top predictions to consider (default 12)
  // Deprecated temperature options are accepted for old saved state, but this
  // backtest now intentionally ranks from empirical drought hazard only.
  alpha?: number;
  hybridWeight?: number;
  emaNormalize?: "per-number" | "global";
  enforcePeaks?: boolean;
  metric?: "ema" | "recency" | "hybrid";
};

export type SingleBacktestRecord = {
  indexAtPrediction: number;     // index of the last draw used to form prediction
  predictDate?: string;
  nextIndex: number;             // index of the actual next draw we compare against
  nextDate?: string;
  topK: number[];
  firstHitNum?: number;          // number that matched (closest in rank)
  firstHitRank?: number;         // 1-based rank in topK
  hits: { num: number; rank: number; where: "main" | "supp" }[];
};

export type BacktestSummary = {
  totalPredictions: number;
  totalHits: number;           // any hit in topK
  hitAtTop1: number;
  hitAtTop3: number;
  hitAtTop5: number;
  hitAtTop10: number;
  averageFirstHitRank?: number; // only among predictions with a hit
  rankDistribution: Record<string, number>; // map "1","2",...,"miss" -> counts
  baseline: {
    scope: "mains+supps";
    perNumberAnyDrawnProbability: number;
    topKAnyHitProbability: number;
    expectedHitsInTopK: number;
  };
  records: SingleBacktestRecord[];
};

const defaultOpts: BacktestOptions = {
  minHistory: 20,
  useRollingWindow: true,
  windowSize: 180,
  topK: 12,
  alpha: 0.25,
  hybridWeight: 0.6,
  emaNormalize: "per-number",
  enforcePeaks: true,
  metric: "hybrid",
};

function combinations(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i;
  }
  return result;
}

function topKAnyHitBaseline(topK: number): number {
  const safeTopK = Math.max(0, Math.min(45, Math.round(topK)));
  if (safeTopK <= 0) return 0;
  if (safeTopK > 37) return 1;
  return 1 - combinations(45 - safeTopK, 8) / combinations(45, 8);
}

export type StrictDroughtBacktestOptions = {
  minHistory?: number;
  topK?: number;
  threshold?: number;
  randomTrials?: number;
  bootstrapIterations?: number;
  focusStartDrawNumber?: number | null;
  seed?: number;
};

export type StrictDroughtBacktestHit = {
  num: number;
  rank: number;
  where: "main" | "supp";
};

export const STRICT_DROUGHT_BUCKET_LABELS = [
  "Undrawn",
  "1x",
  "2x",
  "3x",
  "4x",
  "5x",
  "6x",
  "7x",
  "8x+",
] as const;

export type StrictDroughtBucketLabel = typeof STRICT_DROUGHT_BUCKET_LABELS[number];
export type StrictDroughtBucketCounts = Record<StrictDroughtBucketLabel, number>;

export type StrictDroughtBacktestRecord = {
  targetIndex: number;
  targetDrawNumber: number;
  targetDate?: string;
  targetDrawOrdinal?: number;
  targetMonthDrawCount?: number;
  remainingDrawsInMonth?: number;
  targetMonthComplete: boolean;
  trainingDraws: number;
  shortlist: number[];
  actualNumbers: number[];
  shortlistBucketCountsBefore: StrictDroughtBucketCounts;
  actualOriginBucketCounts: StrictDroughtBucketCounts;
  hits: StrictDroughtBacktestHit[];
  hitCount: number;
  inObservedBand: boolean;
};

export type StrictDroughtBacktestMetricSummary = {
  label: string;
  trials: number;
  averageShortlistSize: number;
  averageHits: number;
  expectedRandomAverageHits: number;
  averageHitLift: number;
  zeroHitRate: number;
  expectedRandomZeroHitRate: number;
  oneToThreeHitRate: number;
  expectedRandomOneToThreeHitRate: number;
  oneToThreeLift: number;
  overThreeHitRate: number;
  expectedRandomOverThreeHitRate: number;
  distribution: Record<"0" | "1" | "2" | "3" | "4+", number>;
  bootstrapAverageHitsCi: [number, number] | null;
  bootstrapOneToThreeCi: [number, number] | null;
  randomBenchmarkAverageHitsPValue: number | null;
  randomBenchmarkOneToThreePValue: number | null;
};

export type StrictDroughtBacktestOrdinalSummary = {
  ordinal: number;
  trials: number;
  averageHits: number;
  oneToThreeHitRate: number;
  expectedRandomOneToThreeHitRate: number;
  zeroHitRate: number;
  averageShortlistUndrawn: number;
  averageActualUndrawnOrigin: number;
};

export type StrictDroughtBucketProfileSummary = {
  label: string;
  trials: number;
  averageHits: number;
  zeroHitRate: number;
  averageShortlistUndrawn: number;
  averageShortlistActiveOneTwo: number;
  averageActualUndrawnOrigin: number;
  averageActualActiveOneTwoOrigin: number;
  averageActualUpperOrigin: number;
};

export type StrictDroughtMonthStageSummary = {
  monthDrawCount: number;
  ordinal: number;
  remainingDrawsInMonth: number;
  isFinalDraw: boolean;
  trials: number;
  averageHits: number;
  oneToThreeHitRate: number;
  expectedRandomOneToThreeHitRate: number;
  oneToThreeLift: number;
  zeroHitRate: number;
  averageShortlistUndrawn: number;
  averageActualUndrawnOrigin: number;
  averageActualActiveOneTwoOrigin: number;
};

export type StrictDroughtBacktestResult = {
  scope: "mains+supps";
  threshold: number;
  topK: number;
  minHistory: number;
  randomTrials: number;
  bootstrapIterations: number;
  focusStartDrawNumber: number | null;
  records: StrictDroughtBacktestRecord[];
  all: StrictDroughtBacktestMetricSummary;
  focus: StrictDroughtBacktestMetricSummary | null;
  byOrdinal: StrictDroughtBacktestOrdinalSummary[];
  bucketProfiles: StrictDroughtBucketProfileSummary[];
  byMonthStage: StrictDroughtMonthStageSummary[];
  incompleteMonthStageRecordsExcluded: number;
};

const defaultStrictBacktestOpts: Required<Omit<StrictDroughtBacktestOptions, "focusStartDrawNumber">> & {
  focusStartDrawNumber: number | null;
} = {
  minHistory: 24,
  topK: 8,
  threshold: STRICT_DROUGHT_DEFAULT_THRESHOLD,
  randomTrials: 5000,
  bootstrapIterations: 1000,
  focusStartDrawNumber: null,
  seed: 73129,
};

function drawNumbers(draw: Draw): number[] {
  return [...draw.main, ...draw.supp].filter((number) => number >= 1 && number <= 45);
}

function drawNumberSet(draw: Draw): Set<number> {
  return new Set(drawNumbers(draw));
}

function parseMonthKey(date: string | undefined): string | null {
  if (!date) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim());
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(date.trim());
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return `${year}-${slash[1].padStart(2, "0")}`;
  }
  return null;
}

function monthMetadataByLabel(history: Draw[]): Map<string, { drawCount: number; complete: boolean }> {
  const map = new Map<string, { drawCount: number; complete: boolean }>();
  history.forEach((draw) => {
    const monthKey = parseMonthKey(draw.date);
    if (!monthKey) return;
    const current = map.get(monthKey) ?? { drawCount: 0, complete: true };
    map.set(monthKey, { ...current, drawCount: current.drawCount + 1 });
  });

  const latestMonthKey = parseMonthKey(history[history.length - 1]?.date);
  if (latestMonthKey && map.has(latestMonthKey)) {
    const latest = map.get(latestMonthKey)!;
    map.set(latestMonthKey, { ...latest, complete: false });
  }

  return map;
}

function drawOrdinalInMonth(history: Draw[], targetIndex: number): number | undefined {
  const monthKey = parseMonthKey(history[targetIndex]?.date);
  if (!monthKey) return undefined;
  let ordinal = 0;
  for (let index = 0; index <= targetIndex; index++) {
    if (parseMonthKey(history[index]?.date) === monthKey) ordinal += 1;
  }
  return ordinal || undefined;
}

function monthlyCountsBeforeTarget(history: Draw[], targetIndex: number): number[] {
  const targetMonthKey = parseMonthKey(history[targetIndex]?.date);
  const counts = new Array<number>(46).fill(0);
  if (!targetMonthKey) return counts;

  for (let index = 0; index < targetIndex; index++) {
    if (parseMonthKey(history[index]?.date) !== targetMonthKey) continue;
    drawNumberSet(history[index]).forEach((number) => {
      counts[number] += 1;
    });
  }

  return counts;
}

function emptyBucketCounts(): StrictDroughtBucketCounts {
  return STRICT_DROUGHT_BUCKET_LABELS.reduce((acc, label) => {
    acc[label] = 0;
    return acc;
  }, {} as StrictDroughtBucketCounts);
}

function bucketLabelForCount(count: number): StrictDroughtBucketLabel {
  if (count <= 0) return "Undrawn";
  if (count >= 8) return "8x+";
  return `${count}x` as StrictDroughtBucketLabel;
}

function bucketCountsForNumbers(numbers: number[], monthlyCounts: number[]): StrictDroughtBucketCounts {
  const result = emptyBucketCounts();
  numbers.forEach((number) => {
    if (!Number.isInteger(number) || number < 1 || number > 45) return;
    const label = bucketLabelForCount(monthlyCounts[number] ?? 0);
    result[label] += 1;
  });
  return result;
}

function hypergeometricProbability(shortlistSize: number, hits: number): number {
  const k = Math.max(0, Math.min(45, Math.round(shortlistSize)));
  const x = Math.max(0, Math.round(hits));
  if (x > k || x > 8) return 0;
  return combinations(k, x) * combinations(45 - k, 8 - x) / combinations(45, 8);
}

function expectedRandomBandProbability(shortlistSize: number): number {
  return [1, 2, 3].reduce((sum, hits) => sum + hypergeometricProbability(shortlistSize, hits), 0);
}

function expectedRandomOverThreeProbability(shortlistSize: number): number {
  const maxHits = Math.min(8, Math.max(0, Math.round(shortlistSize)));
  let total = 0;
  for (let hits = 4; hits <= maxHits; hits++) {
    total += hypergeometricProbability(shortlistSize, hits);
  }
  return total;
}

function makeSeededRandom(seed: number): () => number {
  let state = Math.max(1, Math.floor(seed) >>> 0);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleUniqueNumbers(count: number, random: () => number): number[] {
  const pool = Array.from({ length: 45 }, (_, index) => index + 1);
  const safeCount = Math.max(0, Math.min(45, Math.round(count)));
  for (let index = 0; index < safeCount; index++) {
    const swapIndex = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, safeCount);
}

function quantile(sortedValues: number[], q: number): number {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function bootstrapCi(
  values: number[],
  iterations: number,
  seed: number,
): [number, number] | null {
  if (!values.length || iterations <= 0) return null;
  const random = makeSeededRandom(seed);
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let total = 0;
    for (let draw = 0; draw < values.length; draw++) {
      total += values[Math.floor(random() * values.length)] ?? 0;
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

function simulateRandomBenchmark(
  records: StrictDroughtBacktestRecord[],
  observedAverageHits: number,
  observedBandRate: number,
  randomTrials: number,
  seed: number,
): { averageHitsPValue: number | null; oneToThreePValue: number | null } {
  if (!records.length || randomTrials <= 0) {
    return { averageHitsPValue: null, oneToThreePValue: null };
  }
  const random = makeSeededRandom(seed);
  let averageHitsAtLeastObserved = 0;
  let bandRateAtLeastObserved = 0;

  for (let trial = 0; trial < randomTrials; trial++) {
    let totalHits = 0;
    let bandHits = 0;
    for (const record of records) {
      const randomShortlist = sampleUniqueNumbers(record.shortlist.length, random);
      const actual = new Set(record.actualNumbers);
      const hitCount = randomShortlist.reduce((count, number) => count + (actual.has(number) ? 1 : 0), 0);
      totalHits += hitCount;
      if (hitCount >= 1 && hitCount <= 3) bandHits += 1;
    }
    const averageHits = totalHits / records.length;
    const bandRate = bandHits / records.length;
    if (averageHits >= observedAverageHits) averageHitsAtLeastObserved += 1;
    if (bandRate >= observedBandRate) bandRateAtLeastObserved += 1;
  }

  return {
    averageHitsPValue: (averageHitsAtLeastObserved + 1) / (randomTrials + 1),
    oneToThreePValue: (bandRateAtLeastObserved + 1) / (randomTrials + 1),
  };
}

function summarizeStrictRecords(
  label: string,
  records: StrictDroughtBacktestRecord[],
  options: Pick<Required<StrictDroughtBacktestOptions>, "bootstrapIterations" | "randomTrials" | "seed">,
  includeRandomBenchmark: boolean,
): StrictDroughtBacktestMetricSummary {
  const trials = records.length;
  const distribution: Record<"0" | "1" | "2" | "3" | "4+", number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4+": 0,
  };
  for (const record of records) {
    const bucket = record.hitCount >= 4 ? "4+" : String(record.hitCount) as keyof typeof distribution;
    distribution[bucket] += 1;
  }

  const totalHits = records.reduce((sum, record) => sum + record.hitCount, 0);
  const totalShortlistSize = records.reduce((sum, record) => sum + record.shortlist.length, 0);
  const randomExpectedHits = records.reduce((sum, record) => sum + (8 * record.shortlist.length / 45), 0);
  const randomZeroRate = records.reduce((sum, record) => sum + hypergeometricProbability(record.shortlist.length, 0), 0);
  const randomBandRate = records.reduce((sum, record) => sum + expectedRandomBandProbability(record.shortlist.length), 0);
  const randomOverThreeRate = records.reduce((sum, record) => sum + expectedRandomOverThreeProbability(record.shortlist.length), 0);
  const averageHits = trials ? totalHits / trials : 0;
  const oneToThreeHitRate = trials ? records.filter((record) => record.inObservedBand).length / trials : 0;
  const randomBenchmark = includeRandomBenchmark
    ? simulateRandomBenchmark(records, averageHits, oneToThreeHitRate, options.randomTrials, options.seed + 17)
    : { averageHitsPValue: null, oneToThreePValue: null };

  return {
    label,
    trials,
    averageShortlistSize: trials ? totalShortlistSize / trials : 0,
    averageHits,
    expectedRandomAverageHits: trials ? randomExpectedHits / trials : 0,
    averageHitLift: averageHits - (trials ? randomExpectedHits / trials : 0),
    zeroHitRate: trials ? distribution["0"] / trials : 0,
    expectedRandomZeroHitRate: trials ? randomZeroRate / trials : 0,
    oneToThreeHitRate,
    expectedRandomOneToThreeHitRate: trials ? randomBandRate / trials : 0,
    oneToThreeLift: oneToThreeHitRate - (trials ? randomBandRate / trials : 0),
    overThreeHitRate: trials ? distribution["4+"] / trials : 0,
    expectedRandomOverThreeHitRate: trials ? randomOverThreeRate / trials : 0,
    distribution,
    bootstrapAverageHitsCi: bootstrapCi(records.map((record) => record.hitCount), options.bootstrapIterations, options.seed + 31),
    bootstrapOneToThreeCi: bootstrapCi(records.map((record) => (record.inObservedBand ? 1 : 0)), options.bootstrapIterations, options.seed + 47),
    randomBenchmarkAverageHitsPValue: randomBenchmark.averageHitsPValue,
    randomBenchmarkOneToThreePValue: randomBenchmark.oneToThreePValue,
  };
}

function bucketTotal(counts: StrictDroughtBucketCounts, labels: StrictDroughtBucketLabel[]): number {
  return labels.reduce((sum, label) => sum + (counts[label] ?? 0), 0);
}

function averageBucketTotal(
  records: StrictDroughtBacktestRecord[],
  source: "shortlistBucketCountsBefore" | "actualOriginBucketCounts",
  labels: StrictDroughtBucketLabel[],
): number {
  if (!records.length) return 0;
  return records.reduce((sum, record) => sum + bucketTotal(record[source], labels), 0) / records.length;
}

function summarizeBucketProfile(label: string, records: StrictDroughtBacktestRecord[]): StrictDroughtBucketProfileSummary {
  const trials = records.length;
  const totalHits = records.reduce((sum, record) => sum + record.hitCount, 0);
  return {
    label,
    trials,
    averageHits: trials ? totalHits / trials : 0,
    zeroHitRate: trials ? records.filter((record) => record.hitCount === 0).length / trials : 0,
    averageShortlistUndrawn: averageBucketTotal(records, "shortlistBucketCountsBefore", ["Undrawn"]),
    averageShortlistActiveOneTwo: averageBucketTotal(records, "shortlistBucketCountsBefore", ["1x", "2x"]),
    averageActualUndrawnOrigin: averageBucketTotal(records, "actualOriginBucketCounts", ["Undrawn"]),
    averageActualActiveOneTwoOrigin: averageBucketTotal(records, "actualOriginBucketCounts", ["1x", "2x"]),
    averageActualUpperOrigin: averageBucketTotal(records, "actualOriginBucketCounts", ["3x", "4x", "5x", "6x", "7x", "8x+"]),
  };
}

function summarizeStage(
  monthDrawCount: number,
  ordinal: number,
  records: StrictDroughtBacktestRecord[],
): StrictDroughtMonthStageSummary {
  const metrics = summarizeStrictRecords(`${monthDrawCount}D D${ordinal}`, records, {
    bootstrapIterations: 0,
    randomTrials: 0,
    seed: 1,
  }, false);
  const remainingDrawsInMonth = Math.max(0, monthDrawCount - ordinal);
  return {
    monthDrawCount,
    ordinal,
    remainingDrawsInMonth,
    isFinalDraw: remainingDrawsInMonth === 0,
    trials: metrics.trials,
    averageHits: metrics.averageHits,
    oneToThreeHitRate: metrics.oneToThreeHitRate,
    expectedRandomOneToThreeHitRate: metrics.expectedRandomOneToThreeHitRate,
    oneToThreeLift: metrics.oneToThreeLift,
    zeroHitRate: metrics.zeroHitRate,
    averageShortlistUndrawn: averageBucketTotal(records, "shortlistBucketCountsBefore", ["Undrawn"]),
    averageActualUndrawnOrigin: averageBucketTotal(records, "actualOriginBucketCounts", ["Undrawn"]),
    averageActualActiveOneTwoOrigin: averageBucketTotal(records, "actualOriginBucketCounts", ["1x", "2x"]),
  };
}

export function backtestStrictDroughtShortlist(
  history: Draw[],
  opts: StrictDroughtBacktestOptions = {},
): StrictDroughtBacktestResult {
  const merged = { ...defaultStrictBacktestOpts, ...opts };
  const minHistory = Math.max(1, Math.round(merged.minHistory));
  const topK = Math.max(1, Math.min(45, Math.round(merged.topK)));
  const threshold = Math.max(1, Math.round(merged.threshold));
  const randomTrials = Math.max(0, Math.round(merged.randomTrials));
  const bootstrapIterations = Math.max(0, Math.round(merged.bootstrapIterations));
  const focusStartDrawNumber = merged.focusStartDrawNumber == null
    ? null
    : Math.max(1, Math.round(merged.focusStartDrawNumber));
  const records: StrictDroughtBacktestRecord[] = [];
  const monthMetadata = monthMetadataByLabel(history);

  for (let targetIndex = minHistory; targetIndex < history.length; targetIndex++) {
    const trainingHistory = history.slice(0, targetIndex);
    const targetDraw = history[targetIndex];
    const targetMonthKey = parseMonthKey(targetDraw.date);
    const targetMonthMetadata = targetMonthKey ? monthMetadata.get(targetMonthKey) : undefined;
    const targetDrawOrdinal = drawOrdinalInMonth(history, targetIndex);
    const monthlyCountsBefore = monthlyCountsBeforeTarget(history, targetIndex);
    const strictShortlist = computeStrictDroughtShortlist(trainingHistory, trainingHistory, { threshold })
      .rows
      .slice(0, topK)
      .map((row) => row.number);
    const actualSet = drawNumberSet(targetDraw);
    const hits: StrictDroughtBacktestHit[] = [];
    strictShortlist.forEach((num, index) => {
      if (!actualSet.has(num)) return;
      hits.push({
        num,
        rank: index + 1,
        where: targetDraw.main.includes(num) ? "main" : "supp",
      });
    });

    records.push({
      targetIndex,
      targetDrawNumber: targetIndex + 1,
      targetDate: targetDraw.date,
      targetDrawOrdinal,
      targetMonthDrawCount: targetMonthMetadata?.drawCount,
      remainingDrawsInMonth: targetMonthMetadata && targetMonthMetadata.complete && targetDrawOrdinal
        ? Math.max(0, targetMonthMetadata.drawCount - targetDrawOrdinal)
        : undefined,
      targetMonthComplete: Boolean(targetMonthMetadata?.complete),
      trainingDraws: trainingHistory.length,
      shortlist: strictShortlist,
      actualNumbers: drawNumbers(targetDraw),
      shortlistBucketCountsBefore: bucketCountsForNumbers(strictShortlist, monthlyCountsBefore),
      actualOriginBucketCounts: bucketCountsForNumbers(drawNumbers(targetDraw), monthlyCountsBefore),
      hits,
      hitCount: hits.length,
      inObservedBand: hits.length >= 1 && hits.length <= 3,
    });
  }

  const summaryOptions = {
    bootstrapIterations,
    randomTrials,
    seed: Math.max(1, Math.round(merged.seed)),
  };
  const focusRecords = focusStartDrawNumber == null
    ? []
    : records.filter((record) => record.targetDrawNumber >= focusStartDrawNumber);
  const byOrdinal = Array.from(
    records.reduce((map, record) => {
      if (!record.targetDrawOrdinal) return map;
      const bucket = map.get(record.targetDrawOrdinal) ?? [];
      bucket.push(record);
      map.set(record.targetDrawOrdinal, bucket);
      return map;
    }, new Map<number, StrictDroughtBacktestRecord[]>()),
  )
    .sort(([left], [right]) => left - right)
    .map(([ordinal, ordinalRecords]) => {
      const metrics = summarizeStrictRecords(`D${ordinal}`, ordinalRecords, summaryOptions, false);
      return {
        ordinal,
        trials: metrics.trials,
        averageHits: metrics.averageHits,
        oneToThreeHitRate: metrics.oneToThreeHitRate,
        expectedRandomOneToThreeHitRate: metrics.expectedRandomOneToThreeHitRate,
        zeroHitRate: metrics.zeroHitRate,
        averageShortlistUndrawn: averageBucketTotal(ordinalRecords, "shortlistBucketCountsBefore", ["Undrawn"]),
        averageActualUndrawnOrigin: averageBucketTotal(ordinalRecords, "actualOriginBucketCounts", ["Undrawn"]),
      };
    });
  const stageRecords = records.filter((record) =>
    record.targetMonthComplete
    && Number.isInteger(record.targetMonthDrawCount)
    && Number.isInteger(record.targetDrawOrdinal)
  );
  const byMonthStage = Array.from(
    stageRecords.reduce((map, record) => {
      const key = `${record.targetMonthDrawCount}|${record.targetDrawOrdinal}`;
      const bucket = map.get(key) ?? [];
      bucket.push(record);
      map.set(key, bucket);
      return map;
    }, new Map<string, StrictDroughtBacktestRecord[]>()),
  )
    .map(([key, stageRows]) => {
      const [monthDrawCountRaw, ordinalRaw] = key.split("|").map(Number);
      return summarizeStage(monthDrawCountRaw, ordinalRaw, stageRows);
    })
    .sort((left, right) =>
      left.monthDrawCount - right.monthDrawCount ||
      left.ordinal - right.ordinal
    );
  const zeroRecords = records.filter((record) => record.hitCount === 0);
  const positiveRecords = records.filter((record) => record.hitCount > 0);

  return {
    scope: "mains+supps",
    threshold,
    topK,
    minHistory,
    randomTrials,
    bootstrapIterations,
    focusStartDrawNumber,
    records,
    all: summarizeStrictRecords("All eligible draws", records, summaryOptions, true),
    focus: focusStartDrawNumber == null ? null : summarizeStrictRecords(`D${focusStartDrawNumber}+ declared slice`, focusRecords, summaryOptions, true),
    byOrdinal,
    bucketProfiles: [
      summarizeBucketProfile("All replay rows", records),
      summarizeBucketProfile("Zero-hit rows", zeroRecords),
      summarizeBucketProfile("Positive-hit rows", positiveRecords),
    ],
    byMonthStage,
    incompleteMonthStageRecordsExcluded: records.length - stageRecords.length,
  };
}

/**
 * Run empirical drought-hazard backtest on `history`.
 * Returns summary and per-prediction records.
 */
export function backtestDroughtPredictions(history: Draw[], opts: BacktestOptions = {}): BacktestSummary {
  const o = { ...defaultOpts, ...opts };
  const n = history.length;
  const records: SingleBacktestRecord[] = [];
  const topK = Math.max(1, Math.min(45, Math.round(o.topK ?? 12)));

  // We can predict the 'next' draw only when we have at least minHistory draws before prediction.
  // We'll iterate predictionIndex = t where we build signal from draws[0..t] and compare to draws[t+1].
  // So t must run from (minHistory - 1) .. n-2
  const startT = Math.max((o.minHistory ?? 20) - 1, 0);
  for (let t = startT; t <= n - 2; t++) {
    // build window for signal
    const windowStart = o.useRollingWindow ? Math.max(0, t + 1 - (o.windowSize ?? 180)) : 0;
    const windowDraws = history.slice(windowStart, t + 1); // inclusive up to t
    if (windowDraws.length === 0) continue;

    const droughtHazard = computeDroughtHazard(windowDraws);
    const topList = droughtHazard.byNumber
      .slice()
      .sort((a, b) => b.p - a.p || b.k - a.k || a.number - b.number)
      .slice(0, topK)
      .map((x) => x.number);

    const nextDraw = history[t + 1];
    const nextNums = new Set<number>([...nextDraw.main, ...nextDraw.supp]);

    const hits: { num: number; rank: number; where: "main" | "supp" }[] = [];
    for (let rank = 0; rank < topList.length; rank++) {
      const num = topList[rank];
      if (nextNums.has(num)) {
        const where = nextDraw.main.includes(num) ? "main" : "supp";
        hits.push({ num, rank: rank + 1, where });
      }
    }

    let firstHitNum: number | undefined = undefined;
    let firstHitRank: number | undefined = undefined;
    if (hits.length) {
      // pick the predicted with smallest rank (already ascending)
      hits.sort((a, b) => a.rank - b.rank);
      firstHitNum = hits[0].num;
      firstHitRank = hits[0].rank;
    }

    records.push({
      indexAtPrediction: t,
      predictDate: windowDraws[windowDraws.length - 1]?.date,
      nextIndex: t + 1,
      nextDate: nextDraw?.date,
      topK: topList,
      firstHitNum,
      firstHitRank,
      hits,
    });
  }

  // compute summary metrics
  const totalPredictions = records.length;
  let totalHits = 0;
  let hitAtTop1 = 0;
  let hitAtTop3 = 0;
  let hitAtTop5 = 0;
  let hitAtTop10 = 0;
  const rankCounts: Record<string, number> = {};
  let sumRanks = 0;
  let rankCountForAvg = 0;

  for (const r of records) {
    if (!r.hits || r.hits.length === 0) {
      rankCounts["miss"] = (rankCounts["miss"] || 0) + 1;
      continue;
    }
    totalHits++;
    const first = r.firstHitRank!;
    rankCounts[String(first)] = (rankCounts[String(first)] || 0) + 1;
    sumRanks += first;
    rankCountForAvg++;

    if (first === 1) hitAtTop1++;
    if (first <= 3) hitAtTop3++;
    if (first <= 5) hitAtTop5++;
    if (first <= 10) hitAtTop10++;
  }

  const averageFirstHitRank = rankCountForAvg > 0 ? sumRanks / rankCountForAvg : undefined;

  const summary: BacktestSummary = {
    totalPredictions,
    totalHits,
    hitAtTop1,
    hitAtTop3,
    hitAtTop5,
    hitAtTop10,
    averageFirstHitRank,
    rankDistribution: rankCounts,
    baseline: {
      scope: "mains+supps",
      perNumberAnyDrawnProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
      topKAnyHitProbability: topKAnyHitBaseline(topK),
      expectedHitsInTopK: topK * DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    },
    records,
  };

  return summary;
}
