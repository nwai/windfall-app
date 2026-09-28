import type { Draw } from "../types";
import { getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import { computeIdealMonthlyDraw } from "./monthlyDrawSummary";
import {
  buildPlanningDrawContext,
  countScheduledDrawsInMonth,
  datePartsToIso,
  isScheduledDrawDate,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";

export const MONTHLY_STAGE_EVIDENCE_MODEL_VERSION = "MSELA-1";
export const MONTHLY_STAGE_EVIDENCE_MIN_PRIOR_DRAWS = 24;
export const MONTHLY_STAGE_EVIDENCE_GATE_DRAWS = 80;
export const MONTHLY_STAGE_EVIDENCE_GATE_MONTHS = 12;
export const MONTHLY_STAGE_BUCKET_LABELS = [
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

const MAX_NUMBER = 45;
const DRAW_SIZE = 8;
const UNIFORM_HIT_RATE = DRAW_SIZE / MAX_NUMBER;
const BUCKET_PRIOR_STRENGTH = 45;
const STAGE_PRIOR_STRENGTH = 32;
const EXACT_PRIOR_STRENGTH = 24;

export type MonthlyStageEvidenceGateStatus =
  | "insufficient"
  | "stage-supported"
  | "bucket-supported"
  | "watch-evidence"
  | "no-validated-lift";

export interface MonthlyStageEvidenceAuditOptions {
  minPriorDraws?: number;
  now?: Date | string;
}

export interface MonthlyStageEvidenceRecord {
  targetDate: string;
  targetMonthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  priorDraws: number;
  comparableStageMonths: number;
  actualBucketMix: number[];
  stageIdmBucketMix: number[] | null;
  learnedBucketMix: number[];
  bucketBaselineMix: number[];
  stageIdmOverlap: number | null;
  learnedOverlap: number;
  bucketBaselineOverlap: number;
  learnedBrier: number;
  bucketBaselineBrier: number;
  uniformBrier: number;
  brierImprovement: number;
  learnedVsUniformImprovement: number;
  bucketVsUniformImprovement: number;
  learnedTopEightHits: number;
  bucketBaselineTopEightHits: number;
  exactEvidenceTrials: number;
}

export interface MonthlyStageEvidenceGate {
  status: MonthlyStageEvidenceGateStatus;
  scoredDraws: number;
  scoredMonths: number;
  averageBrierImprovement: number;
  monthClusteredCi: [number, number] | null;
  averageLearnedVsUniformImprovement: number;
  learnedVsUniformCi: [number, number] | null;
  averageBucketVsUniformImprovement: number;
  bucketVsUniformCi: [number, number] | null;
  reason: string;
}

export interface MonthlyStageEvidenceCurrentBucketRow {
  bucket: number;
  label: string;
  currentCount: number;
  numbers: number[];
  learnedRate: number;
  bucketBaselineRate: number;
  learnedTargetPicks: number;
  bucketBaselineTargetPicks: number;
  stageIdmTargetPicks: number | null;
  baseTrials: number;
  stageTrials: number;
  exactTrials: number;
}

export interface MonthlyStageEvidenceOrdinalRow {
  drawOrdinal: number;
  scoredDraws: number;
  scoredMonths: number;
  averageBrierImprovement: number;
  learnedAverageOverlap: number;
  bucketBaselineAverageOverlap: number;
  stageIdmAverageOverlap: number | null;
}

export interface MonthlyStageEvidenceCalibrationRow {
  label: string;
  trials: number;
  hits: number;
  averageEstimatedRate: number;
  observedRate: number;
  brierScore: number;
}

export interface MonthlyStageEvidenceCurrentState {
  targetDate: string;
  targetMonthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  completedDrawCount: number;
  comparableStageMonths: number;
  learnedBucketMix: number[];
  bucketBaselineMix: number[];
  stageIdmBucketMix: number[] | null;
  bucketRows: MonthlyStageEvidenceCurrentBucketRow[];
}

export interface MonthlyStageEvidenceAuditResult {
  modelVersion: typeof MONTHLY_STAGE_EVIDENCE_MODEL_VERSION;
  scopeLabel: string;
  validRealDraws: number;
  baselineRealDraws: number;
  excludedHistoryRows: number;
  simulatedRowsIgnored: number;
  excludedOpeningMonthLabels: string[];
  minPriorDraws: number;
  records: MonthlyStageEvidenceRecord[];
  gate: MonthlyStageEvidenceGate;
  currentState: MonthlyStageEvidenceCurrentState | null;
  ordinalRows: MonthlyStageEvidenceOrdinalRow[];
  calibrationRows: MonthlyStageEvidenceCalibrationRow[];
  learnedAverageBrier: number | null;
  bucketBaselineAverageBrier: number | null;
  uniformAverageBrier: number | null;
  learnedAverageOverlap: number | null;
  bucketBaselineAverageOverlap: number | null;
  stageIdmAverageOverlap: number | null;
  learnedAverageTopEightHits: number | null;
  bucketBaselineAverageTopEightHits: number | null;
  randomTopEightExpectation: number;
  warnings: string[];
}

interface Counter {
  trials: number;
  hits: number;
}

interface EvidenceCounters {
  bucket: Map<string, Counter>;
  stage: Map<string, Counter>;
  exact: Map<string, Counter>;
}

interface ValidatedDraw {
  draw: Draw;
  date: string;
  timestamp: number;
  monthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  numbers: number[];
}

interface PreparedDraw extends ValidatedDraw {
  bucketByNumber: number[];
  distributionBefore: number[];
  distributionAfter: number[];
  actualBucketMix: number[];
}

interface PreparedHistory {
  validDraws: ValidatedDraw[];
  draws: PreparedDraw[];
  excludedRows: number;
  simulatedRowsIgnored: number;
  excludedOpeningMonthLabels: string[];
}

interface MonthStageIndexRow {
  monthLabel: string;
  expectedMonthDrawCount: number;
  statesAfter: Map<number, number[]>;
}

interface PredictionSet {
  learned: number[];
  baseline: number[];
  learnedRatesByBucket: number[];
  baselineRatesByBucket: number[];
  baseTrialsByBucket: number[];
  stageTrialsByBucket: number[];
  exactTrialsByBucket: number[];
}

interface CalibrationObservation {
  estimatedRate: number;
  hit: boolean;
}

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const bucketForCount = (count: number): number => Math.min(8, Math.max(0, Math.floor(count)));

const distributionFromCounts = (counts: readonly number[]): number[] => {
  const distribution = new Array(9).fill(0);
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    distribution[bucketForCount(counts[number] ?? 0)] += 1;
  }
  return distribution;
};

const actualBucketMix = (numbers: readonly number[], countsBefore: readonly number[]): number[] => {
  const mix = new Array(9).fill(0);
  numbers.forEach((number) => {
    mix[bucketForCount(countsBefore[number] ?? 0)] += 1;
  });
  return mix;
};

const prepareHistory = (history: readonly Draw[]): PreparedHistory => {
  const seenDates = new Set<string>();
  const validDraws: ValidatedDraw[] = [];
  let excludedRows = 0;
  let simulatedRowsIgnored = 0;

  history.forEach((draw) => {
    if (draw.isSimulated) {
      simulatedRowsIgnored += 1;
      return;
    }
    const parts = parseDrawDateParts(draw.date);
    const values = [...(draw.main ?? []), ...(draw.supp ?? [])];
    const unique = new Set(values);
    if (
      !parts
      || !isScheduledDrawDate(parts)
      || draw.main?.length !== 6
      || draw.supp?.length !== 2
      || values.some((number) => !Number.isInteger(number) || number < 1 || number > MAX_NUMBER)
      || unique.size !== DRAW_SIZE
    ) {
      excludedRows += 1;
      return;
    }
    const date = datePartsToIso(parts);
    if (seenDates.has(date)) {
      excludedRows += 1;
      return;
    }
    seenDates.add(date);
    const monthLabel = monthLabelFromDateParts(parts);
    validDraws.push({
      draw,
      date,
      timestamp: new Date(parts.year, parts.month - 1, parts.day).getTime(),
      monthLabel,
      drawOrdinal: countScheduledDrawsInMonth(monthLabel, parts.day),
      expectedMonthDrawCount: countScheduledDrawsInMonth(monthLabel),
      numbers: [...unique].sort((left, right) => left - right),
    });
  });

  validDraws.sort((left, right) => left.timestamp - right.timestamp);
  const excludedOpeningMonthLabels = getExcludedMonthLabelsForHistoryBaselines(
    validDraws,
    (row) => row.monthLabel,
    (row) => row.date,
  );
  const excludedOpeningMonths = new Set(excludedOpeningMonthLabels);
  const baselineDraws = validDraws.filter((row) => !excludedOpeningMonths.has(row.monthLabel));
  const countsByMonth = new Map<string, number[]>();
  const draws: PreparedDraw[] = [];

  baselineDraws.forEach((row) => {
    const counts = countsByMonth.get(row.monthLabel) ?? new Array(MAX_NUMBER + 1).fill(0);
    const bucketByNumber = new Array(MAX_NUMBER + 1).fill(0);
    for (let number = 1; number <= MAX_NUMBER; number += 1) {
      bucketByNumber[number] = bucketForCount(counts[number] ?? 0);
    }
    const distributionBefore = distributionFromCounts(counts);
    const mix = actualBucketMix(row.numbers, counts);
    row.numbers.forEach((number) => {
      counts[number] += 1;
    });
    countsByMonth.set(row.monthLabel, counts);
    draws.push({
      ...row,
      bucketByNumber,
      distributionBefore,
      distributionAfter: distributionFromCounts(counts),
      actualBucketMix: mix,
    });
  });

  return {
    validDraws,
    draws,
    excludedRows,
    simulatedRowsIgnored,
    excludedOpeningMonthLabels,
  };
};

const makeCounters = (): EvidenceCounters => ({
  bucket: new Map(),
  stage: new Map(),
  exact: new Map(),
});

const getCounter = (map: Map<string, Counter>, key: string): Counter | undefined => map.get(key);

const updateCounter = (map: Map<string, Counter>, key: string, hit: boolean): void => {
  const counter = map.get(key) ?? { trials: 0, hits: 0 };
  counter.trials += 1;
  if (hit) counter.hits += 1;
  map.set(key, counter);
};

const bucketKey = (bucket: number): string => String(bucket);
const stageKey = (drawOrdinal: number, bucket: number): string => `${drawOrdinal}|${bucket}`;
const exactKey = (monthLength: number, drawOrdinal: number, bucket: number): string => (
  `${monthLength}|${drawOrdinal}|${bucket}`
);

const posteriorRate = (counter: Counter | undefined, priorRate: number, strength: number): number => {
  const trials = counter?.trials ?? 0;
  const hits = counter?.hits ?? 0;
  return (hits + priorRate * strength) / (trials + strength);
};

const normalizeProbabilities = (raw: readonly number[], targetTotal: number): number[] => {
  const result = new Array(raw.length).fill(0);
  let remaining = Math.min(targetTotal, raw.length);
  let active = raw.map((_, index) => index);

  while (active.length && remaining > 0) {
    const rawTotal = active.reduce((sum, index) => sum + Math.max(0, raw[index] ?? 0), 0);
    if (rawTotal <= 0) {
      const even = remaining / active.length;
      active.forEach((index) => { result[index] = Math.min(1, even); });
      break;
    }
    const saturated = active.filter((index) => ((Math.max(0, raw[index] ?? 0) / rawTotal) * remaining) >= 1);
    if (!saturated.length) {
      active.forEach((index) => {
        result[index] = (Math.max(0, raw[index] ?? 0) / rawTotal) * remaining;
      });
      break;
    }
    const saturatedSet = new Set(saturated);
    saturated.forEach((index) => { result[index] = 1; });
    remaining -= saturated.length;
    active = active.filter((index) => !saturatedSet.has(index));
  }

  return result;
};

const predictRates = (
  bucketByNumber: readonly number[],
  expectedMonthDrawCount: number,
  drawOrdinal: number,
  counters: EvidenceCounters,
): PredictionSet => {
  const rawLearned: number[] = [];
  const rawBaseline: number[] = [];
  const learnedRatesByBucket = new Array(9).fill(UNIFORM_HIT_RATE);
  const baselineRatesByBucket = new Array(9).fill(UNIFORM_HIT_RATE);
  const baseTrialsByBucket = new Array(9).fill(0);
  const stageTrialsByBucket = new Array(9).fill(0);
  const exactTrialsByBucket = new Array(9).fill(0);

  for (let bucket = 0; bucket <= 8; bucket += 1) {
    const baseCounter = getCounter(counters.bucket, bucketKey(bucket));
    const stageCounter = getCounter(counters.stage, stageKey(drawOrdinal, bucket));
    const exactCounter = getCounter(counters.exact, exactKey(expectedMonthDrawCount, drawOrdinal, bucket));
    const baselineRate = posteriorRate(baseCounter, UNIFORM_HIT_RATE, BUCKET_PRIOR_STRENGTH);
    const stageRate = posteriorRate(stageCounter, baselineRate, STAGE_PRIOR_STRENGTH);
    const learnedRate = posteriorRate(exactCounter, stageRate, EXACT_PRIOR_STRENGTH);
    baselineRatesByBucket[bucket] = baselineRate;
    learnedRatesByBucket[bucket] = learnedRate;
    baseTrialsByBucket[bucket] = baseCounter?.trials ?? 0;
    stageTrialsByBucket[bucket] = stageCounter?.trials ?? 0;
    exactTrialsByBucket[bucket] = exactCounter?.trials ?? 0;
  }

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const bucket = bucketByNumber[number] ?? 0;
    rawBaseline.push(baselineRatesByBucket[bucket]);
    rawLearned.push(learnedRatesByBucket[bucket]);
  }

  return {
    learned: normalizeProbabilities(rawLearned, DRAW_SIZE),
    baseline: normalizeProbabilities(rawBaseline, DRAW_SIZE),
    learnedRatesByBucket,
    baselineRatesByBucket,
    baseTrialsByBucket,
    stageTrialsByBucket,
    exactTrialsByBucket,
  };
};

const updateCounters = (counters: EvidenceCounters, row: PreparedDraw): void => {
  const hits = new Set(row.numbers);
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const bucket = row.bucketByNumber[number] ?? 0;
    const hit = hits.has(number);
    updateCounter(counters.bucket, bucketKey(bucket), hit);
    updateCounter(counters.stage, stageKey(row.drawOrdinal, bucket), hit);
    updateCounter(counters.exact, exactKey(row.expectedMonthDrawCount, row.drawOrdinal, bucket), hit);
  }
};

const brierScore = (probabilities: readonly number[], actual: ReadonlySet<number>): number => mean(
  probabilities.map((probability, index) => (probability - (actual.has(index + 1) ? 1 : 0)) ** 2),
);

const fractionalTopKHits = (
  probabilities: readonly number[],
  actual: ReadonlySet<number>,
  topK = DRAW_SIZE,
): number => {
  if (!probabilities.length || topK <= 0) return 0;
  const sorted = [...probabilities].sort((left, right) => right - left);
  const threshold = sorted[Math.min(topK, sorted.length) - 1] ?? Number.POSITIVE_INFINITY;
  const above = probabilities
    .map((probability, index) => ({ probability, number: index + 1 }))
    .filter((row) => row.probability > threshold + 1e-12);
  const tied = probabilities
    .map((probability, index) => ({ probability, number: index + 1 }))
    .filter((row) => Math.abs(row.probability - threshold) <= 1e-12);
  const tiedWeight = tied.length ? Math.max(0, topK - above.length) / tied.length : 0;
  return above.filter((row) => actual.has(row.number)).length
    + tied.reduce((sum, row) => sum + (actual.has(row.number) ? tiedWeight : 0), 0);
};

const allocateBucketMix = (
  probabilities: readonly number[],
  bucketByNumber: readonly number[],
): number[] => {
  const expected = new Array(9).fill(0);
  const capacities = new Array(9).fill(0);
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    const bucket = bucketByNumber[number] ?? 0;
    expected[bucket] += probabilities[number - 1] ?? 0;
    capacities[bucket] += 1;
  }
  const result = expected.map((value, bucket) => Math.min(capacities[bucket], Math.floor(value)));
  let remaining = DRAW_SIZE - result.reduce((sum, value) => sum + value, 0);
  const order = expected
    .map((value, bucket) => ({ bucket, fraction: value - Math.floor(value), value }))
    .sort((left, right) => right.fraction - left.fraction || right.value - left.value || left.bucket - right.bucket);
  while (remaining > 0) {
    let changed = false;
    for (const row of order) {
      if (remaining <= 0) break;
      if (result[row.bucket] >= capacities[row.bucket]) continue;
      result[row.bucket] += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  return result;
};

const mixOverlap = (predicted: readonly number[], actual: readonly number[]): number => (
  predicted.reduce((sum, value, bucket) => sum + Math.min(value, actual[bucket] ?? 0), 0)
);

const quantile = (values: readonly number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
};

const reconcileDistribution = (values: readonly number[], total: number): number[] => {
  const cleaned = values.map((value) => Math.max(0, Number.isFinite(value) ? value : 0));
  const sum = cleaned.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return [total, ...new Array(Math.max(0, values.length - 1)).fill(0)];
  const scaled = cleaned.map((value) => (value / sum) * total);
  const floors = scaled.map(Math.floor);
  let remaining = total - floors.reduce((acc, value) => acc + value, 0);
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const row of order) {
    if (remaining <= 0) break;
    floors[row.index] += 1;
    remaining -= 1;
  }
  return floors;
};

const buildMonthStageIndex = (draws: readonly PreparedDraw[]): MonthStageIndexRow[] => {
  const byMonth = new Map<string, MonthStageIndexRow>();
  draws.forEach((draw) => {
    const row = byMonth.get(draw.monthLabel) ?? {
      monthLabel: draw.monthLabel,
      expectedMonthDrawCount: draw.expectedMonthDrawCount,
      statesAfter: new Map<number, number[]>(),
    };
    row.statesAfter.set(draw.drawOrdinal, [...draw.distributionAfter]);
    byMonth.set(draw.monthLabel, row);
  });
  return [...byMonth.values()].sort((left, right) => left.monthLabel.localeCompare(right.monthLabel));
};

const stageIdmMix = (
  currentDistribution: readonly number[],
  targetMonthLabel: string,
  expectedMonthDrawCount: number,
  drawOrdinal: number,
  monthIndex: readonly MonthStageIndexRow[],
): { mix: number[] | null; comparableMonths: number } => {
  const comparable = monthIndex
    .filter((month) => (
      month.monthLabel < targetMonthLabel
      && month.expectedMonthDrawCount === expectedMonthDrawCount
      && month.statesAfter.has(drawOrdinal)
    ))
    .map((month) => month.statesAfter.get(drawOrdinal) as number[]);
  if (!comparable.length) return { mix: null, comparableMonths: 0 };
  const medians = new Array(9).fill(0).map((_, bucket) => (
    quantile(comparable.map((distribution) => distribution[bucket] ?? 0), 0.5)
  ));
  const targetDistribution = reconcileDistribution(medians, MAX_NUMBER);
  const ideal = computeIdealMonthlyDraw({
    currentDistribution: [...currentDistribution],
    targetDistribution,
    drawSize: DRAW_SIZE,
  });
  return {
    mix: ideal.bucketCounts.map((row) => row.count),
    comparableMonths: comparable.length,
  };
};

const monthClusteredCi = (
  records: readonly MonthlyStageEvidenceRecord[],
  valueFor: (record: MonthlyStageEvidenceRecord) => number,
): [number, number] | null => {
  const byMonth = new Map<string, number[]>();
  records.forEach((record) => {
    byMonth.set(record.targetMonthLabel, [...(byMonth.get(record.targetMonthLabel) ?? []), valueFor(record)]);
  });
  const monthMeans = [...byMonth.values()].map(mean);
  if (monthMeans.length < 2) return null;
  const average = mean(monthMeans);
  const variance = monthMeans.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (monthMeans.length - 1);
  const margin = 1.96 * Math.sqrt(variance / monthMeans.length);
  return [average - margin, average + margin];
};

const evaluateGate = (records: readonly MonthlyStageEvidenceRecord[]): MonthlyStageEvidenceGate => {
  const months = new Set(records.map((record) => record.targetMonthLabel));
  const averageBrierImprovement = mean(records.map((record) => record.brierImprovement));
  const averageLearnedVsUniformImprovement = mean(records.map((record) => record.learnedVsUniformImprovement));
  const averageBucketVsUniformImprovement = mean(records.map((record) => record.bucketVsUniformImprovement));
  const ci = monthClusteredCi(records, (record) => record.brierImprovement);
  const learnedVsUniformCi = monthClusteredCi(records, (record) => record.learnedVsUniformImprovement);
  const bucketVsUniformCi = monthClusteredCi(records, (record) => record.bucketVsUniformImprovement);
  const shared = {
    scoredDraws: records.length,
    scoredMonths: months.size,
    averageBrierImprovement,
    monthClusteredCi: ci,
    averageLearnedVsUniformImprovement,
    learnedVsUniformCi,
    averageBucketVsUniformImprovement,
    bucketVsUniformCi,
  };
  if (records.length < MONTHLY_STAGE_EVIDENCE_GATE_DRAWS || months.size < MONTHLY_STAGE_EVIDENCE_GATE_MONTHS || !ci) {
    return {
      status: "insufficient",
      ...shared,
      reason: `Needs at least ${MONTHLY_STAGE_EVIDENCE_GATE_DRAWS} scored draws across ${MONTHLY_STAGE_EVIDENCE_GATE_MONTHS} calendar months before stage evidence can clear the audit gate.`,
    };
  }
  if (ci[0] > 0 && (learnedVsUniformCi?.[0] ?? Number.NEGATIVE_INFINITY) > 0) {
    return {
      status: "stage-supported",
      ...shared,
      reason: "The month-clustered intervals are wholly above zero against both the bucket-only model and the exact 8-of-45 control. Stage and month-length context clears the observe-only evidence gate.",
    };
  }
  if ((bucketVsUniformCi?.[0] ?? Number.NEGATIVE_INFINITY) > 0 && ci[0] <= 0) {
    return {
      status: "bucket-supported",
      ...shared,
      reason: "Bucket state clears the exact 8-of-45 control, but adding draw ordinal and month length does not clear the bucket-only model. Keep bucket-only evidence as the observe-only reference.",
    };
  }
  if (
    averageBrierImprovement <= 0
    && averageLearnedVsUniformImprovement <= 0
    && averageBucketVsUniformImprovement <= 0
  ) {
    return {
      status: "no-validated-lift",
      ...shared,
      reason: "Neither learned model reduced average Brier error below the exact 8-of-45 control. The neutral mathematical control remains the honest reference.",
    };
  }
  return {
    status: "watch-evidence",
    ...shared,
    reason: "At least one learned comparison is ahead on average, but the required month-clustered intervals do not confirm improvement. Continue observing without promotion.",
  };
};

const buildOrdinalRows = (records: readonly MonthlyStageEvidenceRecord[]): MonthlyStageEvidenceOrdinalRow[] => {
  const ordinals = [...new Set(records.map((record) => record.drawOrdinal))].sort((left, right) => left - right);
  return ordinals.map((drawOrdinal) => {
    const rows = records.filter((record) => record.drawOrdinal === drawOrdinal);
    const stageIdmRows = rows.filter((record) => record.stageIdmOverlap !== null);
    return {
      drawOrdinal,
      scoredDraws: rows.length,
      scoredMonths: new Set(rows.map((record) => record.targetMonthLabel)).size,
      averageBrierImprovement: mean(rows.map((record) => record.brierImprovement)),
      learnedAverageOverlap: mean(rows.map((record) => record.learnedOverlap)),
      bucketBaselineAverageOverlap: mean(rows.map((record) => record.bucketBaselineOverlap)),
      stageIdmAverageOverlap: stageIdmRows.length
        ? mean(stageIdmRows.map((record) => record.stageIdmOverlap as number))
        : null,
    };
  });
};

const buildCalibrationRows = (
  observations: readonly CalibrationObservation[],
): MonthlyStageEvidenceCalibrationRow[] => {
  const bins = [
    { label: "Under 12%", min: 0, max: 0.12 },
    { label: "12% to under 16%", min: 0.12, max: 0.16 },
    { label: "16% to under 20%", min: 0.16, max: 0.20 },
    { label: "20% to under 24%", min: 0.20, max: 0.24 },
    { label: "24% and above", min: 0.24, max: Number.POSITIVE_INFINITY },
  ];
  return bins.map((bin) => {
    const rows = observations.filter((row) => row.estimatedRate >= bin.min && row.estimatedRate < bin.max);
    const hits = rows.filter((row) => row.hit).length;
    return {
      label: bin.label,
      trials: rows.length,
      hits,
      averageEstimatedRate: mean(rows.map((row) => row.estimatedRate)),
      observedRate: rows.length ? hits / rows.length : 0,
      brierScore: rows.length
        ? mean(rows.map((row) => (row.estimatedRate - (row.hit ? 1 : 0)) ** 2))
        : 0,
    };
  });
};

const currentState = (
  prepared: PreparedHistory,
  counters: EvidenceCounters,
  monthIndex: readonly MonthStageIndexRow[],
  now?: Date | string,
): MonthlyStageEvidenceCurrentState | null => {
  if (!prepared.draws.length) return null;
  const validHistory = prepared.validDraws.map((row) => row.draw);
  const planning = buildPlanningDrawContext(validHistory, { now });
  const counts = new Array(MAX_NUMBER + 1).fill(0);
  prepared.draws.forEach((row) => {
    if (row.monthLabel !== planning.targetMonthLabel || row.date >= planning.targetDrawDate) return;
    row.numbers.forEach((number) => { counts[number] += 1; });
  });
  const bucketByNumber = new Array(MAX_NUMBER + 1).fill(0);
  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    bucketByNumber[number] = bucketForCount(counts[number] ?? 0);
  }
  const distribution = distributionFromCounts(counts);
  const prediction = predictRates(
    bucketByNumber,
    planning.targetMonthExpectedDrawCount,
    planning.targetDrawOrdinal,
    counters,
  );
  const learnedMix = allocateBucketMix(prediction.learned, bucketByNumber);
  const baselineMix = allocateBucketMix(prediction.baseline, bucketByNumber);
  const idm = stageIdmMix(
    distribution,
    planning.targetMonthLabel,
    planning.targetMonthExpectedDrawCount,
    planning.targetDrawOrdinal,
    monthIndex,
  );
  const bucketRows = MONTHLY_STAGE_BUCKET_LABELS.map((label, bucket) => {
    const numbers: number[] = [];
    for (let number = 1; number <= MAX_NUMBER; number += 1) {
      if (bucketByNumber[number] === bucket) numbers.push(number);
    }
    const firstNumber = numbers[0];
    return {
      bucket,
      label,
      currentCount: numbers.length,
      numbers,
      learnedRate: firstNumber ? prediction.learned[firstNumber - 1] : 0,
      bucketBaselineRate: firstNumber ? prediction.baseline[firstNumber - 1] : 0,
      learnedTargetPicks: learnedMix[bucket] ?? 0,
      bucketBaselineTargetPicks: baselineMix[bucket] ?? 0,
      stageIdmTargetPicks: idm.mix?.[bucket] ?? null,
      baseTrials: prediction.baseTrialsByBucket[bucket] ?? 0,
      stageTrials: prediction.stageTrialsByBucket[bucket] ?? 0,
      exactTrials: prediction.exactTrialsByBucket[bucket] ?? 0,
    };
  });
  return {
    targetDate: planning.targetDrawDate,
    targetMonthLabel: planning.targetMonthLabel,
    drawOrdinal: planning.targetDrawOrdinal,
    expectedMonthDrawCount: planning.targetMonthExpectedDrawCount,
    completedDrawCount: planning.completedDrawsInTargetMonth,
    comparableStageMonths: idm.comparableMonths,
    learnedBucketMix: learnedMix,
    bucketBaselineMix: baselineMix,
    stageIdmBucketMix: idm.mix,
    bucketRows,
  };
};

export const analyzeMonthlyStageEvidence = (
  history: readonly Draw[],
  options: MonthlyStageEvidenceAuditOptions = {},
): MonthlyStageEvidenceAuditResult => {
  const minPriorDraws = Math.max(1, Math.round(options.minPriorDraws ?? MONTHLY_STAGE_EVIDENCE_MIN_PRIOR_DRAWS));
  const prepared = prepareHistory(history);
  const monthIndex = buildMonthStageIndex(prepared.draws);
  const counters = makeCounters();
  const records: MonthlyStageEvidenceRecord[] = [];
  const calibrationObservations: CalibrationObservation[] = [];

  prepared.draws.forEach((row, index) => {
    const prediction = predictRates(row.bucketByNumber, row.expectedMonthDrawCount, row.drawOrdinal, counters);
    const actual = new Set(row.numbers);
    const learnedMix = allocateBucketMix(prediction.learned, row.bucketByNumber);
    const baselineMix = allocateBucketMix(prediction.baseline, row.bucketByNumber);
    const idm = stageIdmMix(
      row.distributionBefore,
      row.monthLabel,
      row.expectedMonthDrawCount,
      row.drawOrdinal,
      monthIndex,
    );

    if (index >= minPriorDraws) {
      const learnedBrier = brierScore(prediction.learned, actual);
      const bucketBaselineBrier = brierScore(prediction.baseline, actual);
      const uniformBrier = brierScore(new Array(MAX_NUMBER).fill(UNIFORM_HIT_RATE), actual);
      const exactKeys = new Set(row.bucketByNumber.slice(1).map((bucket) => (
        exactKey(row.expectedMonthDrawCount, row.drawOrdinal, bucket)
      )));
      records.push({
        targetDate: row.date,
        targetMonthLabel: row.monthLabel,
        drawOrdinal: row.drawOrdinal,
        expectedMonthDrawCount: row.expectedMonthDrawCount,
        priorDraws: index,
        comparableStageMonths: idm.comparableMonths,
        actualBucketMix: [...row.actualBucketMix],
        stageIdmBucketMix: idm.mix ? [...idm.mix] : null,
        learnedBucketMix: learnedMix,
        bucketBaselineMix: baselineMix,
        stageIdmOverlap: idm.mix ? mixOverlap(idm.mix, row.actualBucketMix) : null,
        learnedOverlap: mixOverlap(learnedMix, row.actualBucketMix),
        bucketBaselineOverlap: mixOverlap(baselineMix, row.actualBucketMix),
        learnedBrier,
        bucketBaselineBrier,
        uniformBrier,
        brierImprovement: bucketBaselineBrier - learnedBrier,
        learnedVsUniformImprovement: uniformBrier - learnedBrier,
        bucketVsUniformImprovement: uniformBrier - bucketBaselineBrier,
        learnedTopEightHits: fractionalTopKHits(prediction.learned, actual),
        bucketBaselineTopEightHits: fractionalTopKHits(prediction.baseline, actual),
        exactEvidenceTrials: [...exactKeys].reduce((sum, key) => sum + (counters.exact.get(key)?.trials ?? 0), 0),
      });
      prediction.learned.forEach((estimatedRate, numberIndex) => {
        calibrationObservations.push({ estimatedRate, hit: actual.has(numberIndex + 1) });
      });
    }

    updateCounters(counters, row);
  });

  const stageIdmRecords = records.filter((record) => record.stageIdmOverlap !== null);
  const warnings: string[] = [];
  if (prepared.excludedOpeningMonthLabels.length) {
    warnings.push(`Opening partial month excluded from learning and audit baselines: ${prepared.excludedOpeningMonthLabels.join(", ")}.`);
  }
  if (prepared.excludedRows) {
    warnings.push(`${prepared.excludedRows} invalid, duplicate-date, off-schedule, or non-6+2 history row${prepared.excludedRows === 1 ? " was" : "s were"} excluded.`);
  }
  if (records.length < MONTHLY_STAGE_EVIDENCE_GATE_DRAWS) {
    warnings.push("The walk-forward ledger is still below the minimum draw count for a stage-evidence decision.");
  }

  return {
    modelVersion: MONTHLY_STAGE_EVIDENCE_MODEL_VERSION,
    scopeLabel: "Mains + supps; strict real 6+2 draws; opening partial month removed; no target or later draw enters its own training data",
    validRealDraws: prepared.validDraws.length,
    baselineRealDraws: prepared.draws.length,
    excludedHistoryRows: prepared.excludedRows,
    simulatedRowsIgnored: prepared.simulatedRowsIgnored,
    excludedOpeningMonthLabels: prepared.excludedOpeningMonthLabels,
    minPriorDraws,
    records,
    gate: evaluateGate(records),
    currentState: currentState(prepared, counters, monthIndex, options.now),
    ordinalRows: buildOrdinalRows(records),
    calibrationRows: buildCalibrationRows(calibrationObservations),
    learnedAverageBrier: records.length ? mean(records.map((record) => record.learnedBrier)) : null,
    bucketBaselineAverageBrier: records.length ? mean(records.map((record) => record.bucketBaselineBrier)) : null,
    uniformAverageBrier: records.length ? mean(records.map((record) => record.uniformBrier)) : null,
    learnedAverageOverlap: records.length ? mean(records.map((record) => record.learnedOverlap)) : null,
    bucketBaselineAverageOverlap: records.length ? mean(records.map((record) => record.bucketBaselineOverlap)) : null,
    stageIdmAverageOverlap: stageIdmRecords.length
      ? mean(stageIdmRecords.map((record) => record.stageIdmOverlap as number))
      : null,
    learnedAverageTopEightHits: records.length ? mean(records.map((record) => record.learnedTopEightHits)) : null,
    bucketBaselineAverageTopEightHits: records.length
      ? mean(records.map((record) => record.bucketBaselineTopEightHits))
      : null,
    randomTopEightExpectation: (DRAW_SIZE * DRAW_SIZE) / MAX_NUMBER,
    warnings,
  };
};

export default analyzeMonthlyStageEvidence;
